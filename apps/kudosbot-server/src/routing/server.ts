import express from "express";
import morgan from "morgan";
import { ApplicationContext } from "../types";
import { initHealthcheckRoutes } from "./routes/healthCheckRoutes";
import { initUploadRoute } from "./routes/uploadRoute";
import { RouteInitializer } from "./types";

const routes: RouteInitializer[] = [initHealthcheckRoutes, initUploadRoute];

export async function startServer(
  context: ApplicationContext
): Promise<express.Application> {
  return new Promise<express.Application>((resolve, reject) => {
    const port = process.env.PORT ?? 3005;
    const app = express();
    app.use(morgan("tiny"));

    routes.forEach((r) => r(app, context));

    app
      .listen(port, () => {
        console.log(`[INIT] HTTP server listening on port ${port}`);
        resolve(app);
      })
      .on("error", (e: Error) => {
        reject(e);
      });

    return app;
  });
}
