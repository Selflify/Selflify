import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";

export type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<string>;

export interface CaddyGateway {
  writeGeneratedConfig(config: SelflifyConfig): Promise<string>;
  validateConfig(config: SelflifyConfig): Promise<void>;
  reload(config: SelflifyConfig): Promise<void>;
  hashPassword(config: SelflifyConfig, password: string): Promise<string>;
}

export interface DnsGateway {
  syncSiteRecords(config: SelflifyConfig, site: SiteConfig): Promise<void>;
  deleteSiteRecords(config: SelflifyConfig, site: SiteConfig): Promise<void>;
  syncAllSiteRecords(config: SelflifyConfig): Promise<void>;
}
