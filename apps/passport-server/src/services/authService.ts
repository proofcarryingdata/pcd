import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";

const secret = "shared secret";

export interface JWTContents {
  data: {
    email: string;
  };
}

export class AuthService {
  private readonly context: ApplicationContext;

  public constructor(context: ApplicationContext) {
    this.context = context;
  }

  public parseJWTMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // if (req.method.toLowerCase() !== "OPTIONS") {
    //   req.jwt = this.getJWTFromRequest(req);
    // }

    next();
  };

  public requireJWTAuthMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (req.jwt != null) {
      next();
    }

    next(new Error("authorization required for this route"));
  };

  public createUserJWT(email: string): string {
    const token = jwt.sign(
      {
        data: {
          email
        }
      } satisfies JWTContents,
      secret,
      { algorithm: "HS256" }
    );
    return token;
  }

  private getJWTFromRequest(req: Request): JWTContents | null {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger(req.path, "[JWT] no auth header");
      return null;
    }

    try {
      const value = jwt.verify(authHeader, secret) as JWTContents;
      logger(req.path, "[JWT] valid jwt", value);
      return value;
    } catch (e) {
      logger(req.path, "[JWT] invalid jwt", e);
      return null;
    }
  }
}

export function startAuthService(context: ApplicationContext): AuthService {
  return new AuthService(context);
}
