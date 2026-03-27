import { Heading, Stack, Text } from "@chakra-ui/react";

import { AppShell } from "@/components/app-shell";
import { OperationStatusCard } from "@/components/operation-status-card";
import { requireAdminSession } from "@/lib/auth/guards";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { config } = await requireAdminSession();

  return (
    <AppShell domain={config.server.domain}>
      <Stack gap="6">
        <Stack gap="2">
          <Heading size="3xl">Selflify</Heading>
          <Text color="muted" maxW="3xl">
            Manage site previews, generated Caddy routing and deploy storage from a single
            filesystem-backed admin panel.
          </Text>
        </Stack>
        <OperationStatusCard config={config} />
        {children}
      </Stack>
    </AppShell>
  );
}
