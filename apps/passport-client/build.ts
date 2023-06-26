import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import * as dotenv from "dotenv";
import { build, BuildOptions, context } from "esbuild";
import fs from "fs";
import Handlebars from "handlebars";
import * as path from "path";
import { v4 as uuid } from "uuid";

dotenv.config();

const define = {
  "process.env.PASSPORT_SERVER_URL": JSON.stringify(
    process.env.PASSPORT_SERVER_URL || "http://localhost:3002"
  ),
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  ...(process.env.ROLLBAR_TOKEN !== undefined
    ? {
        "process.env.ROLLBAR_TOKEN": JSON.stringify(process.env.ROLLBAR_TOKEN),
      }
    : {}),
};

const passportAppOpts: BuildOptions = {
  sourcemap: true,
  bundle: true,
  entryPoints: ["pages/index.tsx"],
  plugins: [
    NodeModulesPolyfillPlugin(),
    NodeGlobalsPolyfillPlugin({
      process: true,
      buffer: true,
    }),
  ],
  loader: {
    ".svg": "dataurl",
  },
  outdir: "public/js",
  metafile: true,
  define,
};

const serviceWorkerOpts: BuildOptions = {
  tsconfig: "./service-worker-tsconfig.json",
  bundle: true,
  entryPoints: ["src/service-worker.ts"],
  plugins: [
    NodeModulesPolyfillPlugin(),
    NodeGlobalsPolyfillPlugin({
      process: true,
      buffer: true,
    }),
  ],
  // The output directory here needs to be `public/` rather than
  // `public/js` in order for the service worker to be served from
  // the root of the website, which is necessary because service
  // workers are only able to be attached to the same scope as they
  // themselves are served from.
  outdir: "public/",
  // Service workers are only updated when the binary contents of their
  // files changes. The service worker for zupass.org uses this environment
  // variable, which causes its contents to be changed every time `build.ts`
  // is invoked, so that each new production deploy invalidates the previous
  // service worker, which clears zupass.org application code (html, js, etc.),
  // so that clients are not forever stuck on one version of the code.
  define: { ...define, "process.env.SW_ID": JSON.stringify(uuid()) },
};

run(process.argv[2])
  .then(() => console.log("Built passport client"))
  .catch((err) => console.error(err));

async function run(command: string) {
  compileHtml();

  switch (command) {
    case "build":
      const passportRes = await build({ ...passportAppOpts, minify: true });
      console.error("Built", passportRes);

      // Bundle size data for use with https://esbuild.github.io/analyze/
      fs.writeFileSync(
        `${passportAppOpts.outdir}/bundle-size.json`,
        JSON.stringify(passportRes.metafile)
      );

      const serviceWorkerRes = await build({
        ...serviceWorkerOpts,
        minify: true,
      });
      console.error("Built", serviceWorkerRes);
      break;
    case "dev":
      const serviceWorkerCtx = await context(serviceWorkerOpts);
      await serviceWorkerCtx.watch();

      const ctx = await context(passportAppOpts);
      await ctx.watch();

      const { host } = await ctx.serve({
        servedir: "public",
        port: 3000,
        host: "0.0.0.0",
      });

      console.log(`Serving passport client on ${host}`);
      break;
    default:
      throw new Error(`Unknown command ${command}`);
  }
}

function compileHtml() {
  const indexHtmlTemplateSource = fs
    .readFileSync(path.join("public", "index.hbs"))
    .toString();
  const template = Handlebars.compile(indexHtmlTemplateSource);

  const isZuzalu = process.env.IS_ZUZALU === "true";

  const html = template({
    title: isZuzalu ? "Zuzalu Passport" : "PCDPass",
    cssPath: isZuzalu ? "/global-zupass.css" : "/global-pcdpass.css",
  });

  fs.writeFileSync(path.join("public", "index.html"), html);
}
