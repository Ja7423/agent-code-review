/** Errors that HTTP routes translate into status codes. */
export class NotFoundError extends Error {}
/** The request is valid but not allowed in the current state (an invalid transition). */
export class ConflictError extends Error {}
export class InvalidInputError extends Error {}
