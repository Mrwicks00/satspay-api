import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodIssue } from "zod";

/**
 * Zod request validation middleware.
 * Validates req.body against the provided schema.
 * Returns 400 with structured field-level errors if validation fails.
 *
 * Usage: router.post("/endpoint", validate(myZodSchema), handler)
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((e: ZodIssue) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details,
      });
      return;
    }

    // Replace req.body with the parsed (type-safe) data
    req.body = result.data;
    next();
  };
}
