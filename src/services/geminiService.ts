// ============================================================
// Gemini Service Configuration
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ENABLE_AI_PROCESSING = process.env.ENABLE_AI_PROCESSING !== 'false'; // Default: enabled
const AI_MODEL = 'gemini-1.5-flash'; // Use flash model for cost efficiency

let genAI: any | null = null;

function getGenAI(): any | null {
  if (!ENABLE_AI_PROCESSING) {
    return null;
  }

  if (genAI) {
    return genAI;
  }

  if (!GEMINI_API_KEY) {
    console.warn(
      'Gemini API key not configured. AI processing will be disabled. ' +
      'Set GEMINI_API_KEY environment variable.'
    );
    return null;
  }

  try {
    // Dynamically import to avoid requiring the package if not using AI
    const { GoogleGenerativeAI: GeminiClient } = require('@google/generative-ai');
    genAI = new GeminiClient({ apiKey: GEMINI_API_KEY });
    return genAI;
  } catch (error) {
    console.error(
      'Failed to initialize Gemini client: ' +
      (error instanceof Error ? error.message : String(error))
    );
    return null;
  }
}

// ============================================================
// Types & Interfaces
// ============================================================

export interface DocumentClassificationResult {
  classification: string; // MEMO, INVOICE, REQUEST, PROCUREMENT, REPORT, OTHER
  summary: string; // 20-30 words
  confidence: number; // 0.0 to 1.0
  tokenCount: number;
  processingTime: number; // milliseconds
}

export interface DocumentAnalysisError {
  error: true;
  message: string;
  processingTime: number;
}

// ============================================================
// Prompt Template
// ============================================================

function buildClassificationPrompt(content: string): string {
  return `You are a document classification assistant. Analyze the provided text and classify it.

DOCUMENT CONTENT:
---
${content}
---

Your task:
1. Classify the document into ONE of these categories:
   - MEMO: Internal communication or announcement
   - INVOICE: Bill or payment request
   - REQUEST: Request for action or approval
   - PROCUREMENT: Purchase or procurement-related document
   - REPORT: Report or analysis document
   - OTHER: Does not fit above categories

2. Summarize the document in 20-30 words.

3. Provide a confidence score (0.0 to 1.0) for your classification.

IMPORTANT: Return ONLY valid JSON with no additional text:
{
  "classification": "MEMO|INVOICE|REQUEST|PROCUREMENT|REPORT|OTHER",
  "summary": "Summary text here",
  "confidence": 0.95
}`;
}

// ============================================================
// Classification Function
// ============================================================

export async function analyzeDocument(
  content: string
): Promise<DocumentClassificationResult | DocumentAnalysisError> {
  const startTime = Date.now();

  try {
    if (!ENABLE_AI_PROCESSING) {
      return {
        error: true,
        message: 'AI processing is disabled',
        processingTime: Date.now() - startTime,
      };
    }

    const genAIClient = getGenAI();
    if (!genAIClient) {
      return {
        error: true,
        message: 'Gemini API not configured',
        processingTime: Date.now() - startTime,
      };
    }

    // Validate input
    if (!content || typeof content !== 'string') {
      return {
        error: true,
        message: 'Invalid document content provided',
        processingTime: Date.now() - startTime,
      };
    }

    if (content.trim().length === 0) {
      return {
        error: true,
        message: 'Document content cannot be empty',
        processingTime: Date.now() - startTime,
      };
    }

    if (content.length > 100000) {
      return {
        error: true,
        message: 'Document content exceeds maximum length (100,000 characters)',
        processingTime: Date.now() - startTime,
      };
    }

    console.log(`[AI] Starting document analysis for content of ${content.length} characters`);

    const model = genAIClient.getGenerativeModel({ model: AI_MODEL });
    const prompt = buildClassificationPrompt(content);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log(`[AI] Received response from Gemini`);

    // Parse response safely
    let parsedResponse;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`[AI] Failed to parse Gemini response: ${responseText}`);
      return {
        error: true,
        message: 'Failed to parse AI response',
        processingTime: Date.now() - startTime,
      };
    }

    // Validate response structure
    if (
      !parsedResponse.classification ||
      !parsedResponse.summary ||
      typeof parsedResponse.confidence !== 'number'
    ) {
      console.error(`[AI] Invalid response structure: ${JSON.stringify(parsedResponse)}`);
      return {
        error: true,
        message: 'AI response missing required fields',
        processingTime: Date.now() - startTime,
      };
    }

    // Validate classification is one of the allowed types
    const validClassifications = ['MEMO', 'INVOICE', 'REQUEST', 'PROCUREMENT', 'REPORT', 'OTHER'];
    if (!validClassifications.includes(parsedResponse.classification.toUpperCase())) {
      console.warn(`[AI] Invalid classification: ${parsedResponse.classification}, defaulting to OTHER`);
      parsedResponse.classification = 'OTHER';
    }

    // Validate confidence is in valid range
    const confidence = Math.max(0, Math.min(1, Number(parsedResponse.confidence) || 0.5));

    // Validate summary length
    const summary = String(parsedResponse.summary).trim();
    if (summary.length === 0) {
      return {
        error: true,
        message: 'AI returned empty summary',
        processingTime: Date.now() - startTime,
      };
    }

    const processingTime = Date.now() - startTime;

    console.log(
      `[AI] Analysis completed: classification=${parsedResponse.classification}, ` +
      `confidence=${confidence}, time=${processingTime}ms`
    );

    return {
      classification: parsedResponse.classification.toUpperCase(),
      summary: summary.substring(0, 500), // Cap at 500 chars
      confidence,
      tokenCount: Math.ceil(content.length / 4), // Rough estimate
      processingTime,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(`[AI] Document analysis failed: ${errorMessage}`);

    return {
      error: true,
      message: `Document analysis failed: ${errorMessage}`,
      processingTime,
    };
  }
}

// ============================================================
// Batch Analysis (for reprocessing)
// ============================================================

export async function analyzeDocumentBatch(
  documents: Array<{ id: string; content: string }>
): Promise<Map<string, DocumentClassificationResult | DocumentAnalysisError>> {
  const results = new Map<string, DocumentClassificationResult | DocumentAnalysisError>();

  for (const doc of documents) {
    const result = await analyzeDocument(doc.content);
    results.set(doc.id, result);

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

// ============================================================
// Health Check
// ============================================================

export function isAIServiceAvailable(): boolean {
  return ENABLE_AI_PROCESSING && getGenAI() !== null;
}

export function getAIServiceStatus(): {
  enabled: boolean;
  configured: boolean;
  model: string;
} {
  return {
    enabled: ENABLE_AI_PROCESSING,
    configured: GEMINI_API_KEY !== undefined && GEMINI_API_KEY.length > 0,
    model: AI_MODEL,
  };
}
