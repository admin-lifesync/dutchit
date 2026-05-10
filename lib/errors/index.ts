export { AppError, isAppError, type AppErrorOptions } from "@/lib/errors/app-error";
export {
  ERROR_CODES,
  ALL_ERROR_CODES,
  type ErrorCode,
} from "@/lib/errors/error-codes";
export {
  toAppError,
  type ErrorDomain,
} from "@/lib/errors/firebase-error-map";
export { handleError } from "@/lib/errors/handle-error";
export {
  USER_MESSAGES,
  messageFor,
  type UserMessage,
} from "@/lib/errors/user-messages";
