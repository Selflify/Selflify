export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SELFLIFY_CONTAINER_RUNNER_SOCKET) {
    return;
  }

  const { recoverContainerPublicationOnStartup } = await import("@/lib/containers/recovery");
  void recoverContainerPublicationOnStartup().catch(() => {
    console.error("Could not recover the interrupted container publication.");
  });
}
