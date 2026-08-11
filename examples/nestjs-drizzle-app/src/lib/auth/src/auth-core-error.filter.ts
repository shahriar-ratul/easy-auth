import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { AuthCoreError } from "@/lib/auth/core/types.js";

@Catch(AuthCoreError)
export class AuthCoreErrorFilter implements ExceptionFilter {
  catch(exception: AuthCoreError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.status(HttpStatus.UNAUTHORIZED).json({
      statusCode: HttpStatus.UNAUTHORIZED,
      code: exception.code,
      message: exception.message,
    });
  }
}
