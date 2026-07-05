-- MySQL org chart schema with self-referential hierarchy

CREATE TABLE employee (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    reportsTo INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee_reportsTo (reportsTo),
    CONSTRAINT fk_employee_reportsTo
        FOREIGN KEY (reportsTo)
        REFERENCES employee(id)
        ON DELETE SET NULL
);

DELIMITER $$

CREATE TRIGGER employee_no_cycle
BEFORE INSERT ON employee
FOR EACH ROW
BEGIN
    IF NEW.reportsTo IS NOT NULL THEN
        IF NEW.reportsTo = NEW.id THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Employee cannot report to self';
        END IF;

        WITH RECURSIVE ancestors AS (
            SELECT id, reportsTo
            FROM employee
            WHERE id = NEW.reportsTo
            UNION ALL
            SELECT e.id, e.reportsTo
            FROM employee e
            JOIN ancestors a ON e.id = a.reportsTo
        )
        SELECT 1 INTO @cycle
        FROM ancestors
        WHERE id = NEW.id
        LIMIT 1;

        IF @cycle IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Circular reporting relationship detected';
        END IF;
    END IF;
END$$

DELIMITER ;
