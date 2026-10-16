import { createUploadServer } from "@/lib/deploy/server";

createUploadServer({
  root: process.env.SELFLIFY_PREVIEW_ROOT ?? "/var/www",
  state: process.env.SELFLIFY_UPLOAD_STATE ?? "/state",
  permissions: process.env.SELFLIFY_DEPLOY_PERMISSIONS_PATH ?? "/permissions/permissions.json",
  logger: (event) => console.log(JSON.stringify(event)),
})
  .then((server) => {
    server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
  })
  .catch(() => {
    console.error("Could not start upload service.");
    process.exitCode = 1;
  });
