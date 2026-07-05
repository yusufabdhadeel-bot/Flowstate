declare module 'node-cron' {
  interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
  }

  interface Task {
    start(): void;
    stop(): void;
    destroy(): void;
    status: boolean;
  }

  function schedule(expression: string, func: () => void | Promise<void>, options?: ScheduleOptions): Task;
  function validate(expression: string): boolean;
  function timeout(func: () => void | Promise<void>, milliseconds: number): Task;
  function interval(func: () => void | Promise<void>, milliseconds: number): Task;

  export { schedule, validate, timeout, interval, Task, ScheduleOptions };
}
