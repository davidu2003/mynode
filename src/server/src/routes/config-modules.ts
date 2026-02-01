import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { agentManager } from '../websocket/agent.js';

async function authenticate(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

const moduleTypes = ['network', 'timezone', 'dns', 'nftables', 'ssh', 'users'] as const;
const moduleTypeSchema = z.enum(moduleTypes);

const networkSchema = z.object({
  enableBbrFq: z.boolean().default(false),
  disableIpv6: z.boolean().default(false),
  preferIpv4: z.boolean().default(false),
  customSysctl: z.string().optional().default(''),
});

const timezoneSchema = z.object({
  timezone: z.string().min(1),
  enableNtp: z.boolean().default(true),
});

const dnsSchema = z.object({
  servers: z.array(z.string()).default([]),
});

const sshSchema = z.object({
  port: z.number().int().min(1).max(65535),
  allowRootLogin: z.boolean(),
  allowPasswordLogin: z.boolean(),
});

function getDefaultContent(type: typeof moduleTypes[number]) {
  if (type === 'network') {
    return {
      enableBbrFq: false,
      disableIpv6: false,
      preferIpv4: false,
      customSysctl: '',
    };
  }
  if (type === 'timezone') {
    return {
      timezone: 'UTC',
      enableNtp: true,
    };
  }
  if (type === 'dns') {
    return {
      servers: [],
    };
  }
  if (type === 'ssh') {
    return {
      port: 22,
      allowRootLogin: false,
      allowPasswordLogin: false,
    };
  }
  return {};
}

function normalizeSysctlLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSysctlOutput(keys: string[], output: string) {
  const values = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  keys.forEach((key, idx) => {
    result[key] = values[idx] ?? '';
  });
  return result;
}

function extractCustomSysctl(content: string, managedKeys: Set<string>) {
  const lines = content.split('\n');
  const customLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    if (managedKeys.has(key)) {
      continue;
    }
    customLines.push(trimmed);
  }
  return customLines.join('\n');
}

function parseModuleContent(type: typeof moduleTypes[number], content: unknown) {
  if (type === 'network') {
    const parsed = networkSchema.safeParse(content);
    if (!parsed.success) {
      return { error: parsed.error.errors };
    }
    return { data: parsed.data };
  }
  if (type === 'timezone') {
    const parsed = timezoneSchema.safeParse(content);
    if (!parsed.success) {
      return { error: parsed.error.errors };
    }
    return { data: parsed.data };
  }
  if (type === 'dns') {
    const parsed = dnsSchema.safeParse(content);
    if (!parsed.success) {
      return { error: parsed.error.errors };
    }
    return { data: parsed.data };
  }
  if (type === 'ssh') {
    const parsed = sshSchema.safeParse(content);
    if (!parsed.success) {
      return { error: parsed.error.errors };
    }
    return { data: parsed.data };
  }
  return { data: content };
}

function buildNetworkSysctlContent(options: z.infer<typeof networkSchema>, interfaces: string[]) {
  const lines: string[] = [];

  if (options.enableBbrFq) {
    lines.push('net.core.default_qdisc = fq');
    lines.push('net.ipv4.tcp_congestion_control = bbr');
  }

  if (options.disableIpv6) {
    lines.push('net.ipv6.conf.all.autoconf = 0');
    lines.push('net.ipv6.conf.default.autoconf = 0');
    lines.push('net.ipv6.conf.all.accept_ra = 0');
    lines.push('net.ipv6.conf.default.accept_ra = 0');
    lines.push('net.ipv6.conf.all.disable_ipv6 = 1');
    lines.push('net.ipv6.conf.default.disable_ipv6 = 1');
    lines.push('net.ipv6.conf.lo.disable_ipv6 = 1');
    for (const iface of interfaces) {
      lines.push(`net.ipv6.conf.${iface}.disable_ipv6 = 1`);
    }
  }

  if (options.customSysctl) {
    const customLines = normalizeSysctlLines(options.customSysctl.split('\n'));
    lines.push(...customLines);
  }

  return normalizeSysctlLines(lines).join('\n');
}

function selectNetworkInterfaces(allInterfaces: string[]) {
  const excludedPrefixes = ['lo', 'docker', 'veth', 'br-', 'vmnet', 'tap', 'tun', 'wg', 'virbr', 'vboxnet'];
  const filtered = allInterfaces.filter((name) => {
    return !excludedPrefixes.some((prefix) => name === prefix || name.startsWith(prefix));
  });
  if (filtered.length > 0) {
    return filtered;
  }
  return allInterfaces.filter((name) => name !== 'lo');
}

export const configModuleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/modules/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }

    const record = db
      .select()
      .from(schema.configModules)
      .where(eq(schema.configModules.type, parsedType.data))
      .get();

    if (!record) {
      return { type: parsedType.data, content: getDefaultContent(parsedType.data), updatedAt: null };
    }

    return { type: parsedType.data, content: record.content, updatedAt: record.updatedAt };
  });

  fastify.put('/modules/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }

    const { content } = request.body as { content: unknown };
    const parsedContentResult = parseModuleContent(parsedType.data, content);
    if (parsedContentResult.error) {
      return reply.status(400).send({ error: 'Invalid content', details: parsedContentResult.error });
    }
    const parsedContent = parsedContentResult.data;

    const existing = db
      .select()
      .from(schema.configModules)
      .where(eq(schema.configModules.type, parsedType.data))
      .get();

    if (existing) {
      db.update(schema.configModules)
        .set({
          content: parsedContent,
          previousContent: existing.content,
          updatedAt: new Date(),
        })
        .where(eq(schema.configModules.id, existing.id))
        .run();
    } else {
      db.insert(schema.configModules).values({
        type: parsedType.data,
        content: parsedContent,
        previousContent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run();
    }

    return { success: true };
  });

  fastify.post('/modules/:type/rollback', async (request, reply) => {
    const { type } = request.params as { type: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }

    const existing = db
      .select()
      .from(schema.configModules)
      .where(eq(schema.configModules.type, parsedType.data))
      .get();

    if (!existing || !existing.previousContent) {
      return reply.status(400).send({ error: 'No previous version to rollback' });
    }

    db.update(schema.configModules)
      .set({
        content: existing.previousContent,
        previousContent: existing.content,
        updatedAt: new Date(),
      })
      .where(eq(schema.configModules.id, existing.id))
      .run();

    return { success: true };
  });

  fastify.post('/modules/:type/sync', async (request, reply) => {
    const { type } = request.params as { type: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }

    const schemaBody = z.object({
      targetVpsIds: z.array(z.number().int()).min(1, 'targetVpsIds is required'),
    });
    const parsedBody = schemaBody.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsedBody.error.errors });
    }

    const configRecord = db
      .select()
      .from(schema.configModules)
      .where(eq(schema.configModules.type, parsedType.data))
      .get();

    if (!configRecord) {
      return reply.status(400).send({ error: 'Module config not saved' });
    }

    const results: { vpsId: number; success: boolean; error?: string }[] = [];

    for (const vpsId of parsedBody.data.targetVpsIds) {
      const vpsItem = db.select().from(schema.vps).where(eq(schema.vps.id, vpsId)).get();
      if (!vpsItem) {
        results.push({ vpsId, success: false, error: 'VPS not found' });
        continue;
      }

      const syncRecord = db.insert(schema.configModuleSyncRecords).values({
        moduleType: parsedType.data,
        vpsId,
        status: 'pending',
        createdAt: new Date(),
      }).run();

      const recordId = Number(syncRecord.lastInsertRowid);
      const agent = agentManager.getAgent(vpsId);
      if (!agent) {
        db.update(schema.configModuleSyncRecords)
          .set({
            status: 'failed',
            errorMessage: 'Agent not connected',
            syncedAt: new Date(),
          })
          .where(eq(schema.configModuleSyncRecords.id, recordId))
          .run();
        results.push({ vpsId, success: false, error: 'Agent not connected' });
        continue;
      }

      try {
        if (parsedType.data === 'network') {
          await applyNetworkConfig(agent, configRecord.content as z.infer<typeof networkSchema>);
        } else if (parsedType.data === 'timezone') {
          await applyTimezoneConfig(agent, configRecord.content as z.infer<typeof timezoneSchema>);
        } else if (parsedType.data === 'dns') {
          await applyDnsConfig(agent, configRecord.content as z.infer<typeof dnsSchema>);
        } else if (parsedType.data === 'ssh') {
          await applySshConfig(agent, configRecord.content as z.infer<typeof sshSchema>);
        }

        db.update(schema.configModuleSyncRecords)
          .set({
            status: 'success',
            syncedAt: new Date(),
          })
          .where(eq(schema.configModuleSyncRecords.id, recordId))
          .run();
        results.push({ vpsId, success: true });
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        db.update(schema.configModuleSyncRecords)
          .set({
            status: 'failed',
            errorMessage,
            syncedAt: new Date(),
          })
          .where(eq(schema.configModuleSyncRecords.id, recordId))
          .run();
        results.push({ vpsId, success: false, error: errorMessage });
      }
    }

    return { results };
  });

  fastify.get('/modules/:type/vps/:vpsId', async (request, reply) => {
    const { type, vpsId } = request.params as { type: string; vpsId: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }
    if (
      parsedType.data !== 'network' &&
      parsedType.data !== 'timezone' &&
      parsedType.data !== 'dns' &&
      parsedType.data !== 'ssh'
    ) {
      return reply.status(400).send({ error: 'Unsupported module type' });
    }

    const id = parseInt(vpsId, 10);
    const vpsItem = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
    if (!vpsItem) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    const agent = agentManager.getAgent(id);
    if (!agent) {
      return reply.status(503).send({ error: 'Agent not connected' });
    }

    try {
      if (parsedType.data === 'network') {
        const content = await fetchNetworkConfig(agent);
        return { type: 'network', content };
      }
      if (parsedType.data === 'timezone') {
        const content = await fetchTimezoneConfig(agent);
        return { type: 'timezone', content };
      }
      if (parsedType.data === 'dns') {
        const content = await fetchDnsConfig(agent);
        return { type: 'dns', content };
      }
      const content = await fetchSshConfig(agent);
      return { type: 'ssh', content };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to fetch config' });
    }
  });

  fastify.put('/modules/:type/vps/:vpsId', async (request, reply) => {
    const { type, vpsId } = request.params as { type: string; vpsId: string };
    const parsedType = moduleTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid module type' });
    }
    if (
      parsedType.data !== 'network' &&
      parsedType.data !== 'timezone' &&
      parsedType.data !== 'dns' &&
      parsedType.data !== 'ssh'
    ) {
      return reply.status(400).send({ error: 'Unsupported module type' });
    }

    const parsedBody = z.object({ content: z.any() }).safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid content', details: parsedBody.error.errors });
    }
    const contentResult = parseModuleContent(parsedType.data, parsedBody.data.content);
    if (contentResult.error) {
      return reply.status(400).send({ error: 'Invalid content', details: contentResult.error });
    }

    const id = parseInt(vpsId, 10);
    const vpsItem = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
    if (!vpsItem) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    const agent = agentManager.getAgent(id);
    if (!agent) {
      return reply.status(503).send({ error: 'Agent not connected' });
    }

    const syncRecord = db.insert(schema.configModuleSyncRecords).values({
      moduleType: parsedType.data,
      vpsId: id,
      status: 'pending',
      createdAt: new Date(),
    }).run();
    const recordId = Number(syncRecord.lastInsertRowid);

    try {
      if (parsedType.data === 'network') {
        await applyNetworkConfig(agent, contentResult.data as z.infer<typeof networkSchema>);
      } else if (parsedType.data === 'timezone') {
        await applyTimezoneConfig(agent, contentResult.data as z.infer<typeof timezoneSchema>);
      } else if (parsedType.data === 'dns') {
        await applyDnsConfig(agent, contentResult.data as z.infer<typeof dnsSchema>);
      } else if (parsedType.data === 'ssh') {
        await applySshConfig(agent, contentResult.data as z.infer<typeof sshSchema>);
      }
      db.update(schema.configModuleSyncRecords)
        .set({
          status: 'success',
          syncedAt: new Date(),
        })
        .where(eq(schema.configModuleSyncRecords.id, recordId))
        .run();
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      db.update(schema.configModuleSyncRecords)
        .set({
          status: 'failed',
          errorMessage,
          syncedAt: new Date(),
        })
        .where(eq(schema.configModuleSyncRecords.id, recordId))
        .run();
      return reply.status(500).send({ error: errorMessage });
    }
  });
};

async function applyNetworkConfig(agent: ReturnType<typeof agentManager.getAgent>, options: z.infer<typeof networkSchema>) {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const ifaceResult = await agent.exec('ls /sys/class/net');
  const allInterfaces = ifaceResult.stdout.split('\n').map((name) => name.trim()).filter(Boolean);
  const interfaces = selectNetworkInterfaces(allInterfaces);

  const sysctlContent = buildNetworkSysctlContent(options, interfaces);
  const hasSysctl = sysctlContent.length > 0 ? '1' : '0';
  const preferIpv4 = options.preferIpv4 ? '1' : '0';

  const sysctlBlock = sysctlContent.length > 0 ? `${sysctlContent}\n` : '';
  const sysctlFile = '/etc/sysctl.d/99-mynode-network.conf';

  const command = `
set -e
HAS_SYSCTL=${hasSysctl}
PREFER_IPV4=${preferIpv4}
SYSCTL_DIR="/etc/sysctl.d"
SYSCTL_FILE="${sysctlFile}"
SYSCTL_CONF="/etc/sysctl.conf"
MARK_BEGIN="# MYNODE NETWORK BEGIN"
MARK_END="# MYNODE NETWORK END"
if [ -d "$SYSCTL_DIR" ]; then
  if [ "$HAS_SYSCTL" = "1" ]; then
    cat > "$SYSCTL_FILE" <<'EOF'
${sysctlBlock}EOF
  else
    rm -f "$SYSCTL_FILE"
  fi
  sysctl --system
else
  if [ "$HAS_SYSCTL" = "1" ]; then
    if [ -f "$SYSCTL_CONF" ]; then
      sed -i '/^# MYNODE NETWORK BEGIN$/,/^# MYNODE NETWORK END$/d' "$SYSCTL_CONF"
    fi
    printf "%s\\n" "$MARK_BEGIN" >> "$SYSCTL_CONF"
    cat >> "$SYSCTL_CONF" <<'EOF'
${sysctlBlock}EOF
    printf "%s\\n" "$MARK_END" >> "$SYSCTL_CONF"
    sysctl -p "$SYSCTL_CONF"
  else
    if [ -f "$SYSCTL_CONF" ]; then
      sed -i '/^# MYNODE NETWORK BEGIN$/,/^# MYNODE NETWORK END$/d' "$SYSCTL_CONF"
      sysctl -p "$SYSCTL_CONF" || true
    fi
  fi
fi

if [ -f /etc/gai.conf ]; then
  if [ "$PREFER_IPV4" = "1" ]; then
    sed -i 's/^#precedence ::ffff:0:0\\/96  100/precedence ::ffff:0:0\\/96  100/' /etc/gai.conf
    if ! grep -q "^precedence ::ffff:0:0/96  100" /etc/gai.conf; then
      echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
    fi
  else
    sed -i 's/^precedence ::ffff:0:0\\/96  100/#precedence ::ffff:0:0\\/96  100/' /etc/gai.conf
  fi
fi
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Apply network config failed';
    throw new Error(message);
  }
}

async function fetchNetworkConfig(agent: ReturnType<typeof agentManager.getAgent>): Promise<z.infer<typeof networkSchema>> {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const ifaceResult = await agent.exec('ls /sys/class/net');
  const allInterfaces = ifaceResult.stdout.split('\n').map((name) => name.trim()).filter(Boolean);
  const interfaces = selectNetworkInterfaces(allInterfaces);

  const baseKeys = [
    'net.core.default_qdisc',
    'net.ipv4.tcp_congestion_control',
    'net.ipv6.conf.all.autoconf',
    'net.ipv6.conf.default.autoconf',
    'net.ipv6.conf.all.accept_ra',
    'net.ipv6.conf.default.accept_ra',
    'net.ipv6.conf.all.disable_ipv6',
    'net.ipv6.conf.default.disable_ipv6',
    'net.ipv6.conf.lo.disable_ipv6',
  ];
  const baseResult = await agent.exec(`sysctl -n ${baseKeys.join(' ')}`);
  const baseValues = parseSysctlOutput(baseKeys, baseResult.stdout || '');

  let interfaceValues: Record<string, string> = {};
  if (interfaces.length > 0) {
    const ifaceKeys = interfaces.map((iface) => `net.ipv6.conf.${iface}.disable_ipv6`);
    const ifaceResult = await agent.exec(`sysctl -n ${ifaceKeys.join(' ')}`);
    interfaceValues = parseSysctlOutput(ifaceKeys, ifaceResult.stdout || '');
  }

  const enableBbrFq =
    baseValues['net.core.default_qdisc'] === 'fq' &&
    baseValues['net.ipv4.tcp_congestion_control'] === 'bbr';

  const ipv6BaseOk =
    baseValues['net.ipv6.conf.all.autoconf'] === '0' &&
    baseValues['net.ipv6.conf.default.autoconf'] === '0' &&
    baseValues['net.ipv6.conf.all.accept_ra'] === '0' &&
    baseValues['net.ipv6.conf.default.accept_ra'] === '0' &&
    baseValues['net.ipv6.conf.all.disable_ipv6'] === '1' &&
    baseValues['net.ipv6.conf.default.disable_ipv6'] === '1' &&
    baseValues['net.ipv6.conf.lo.disable_ipv6'] === '1';

  const ipv6IfaceOk = interfaces.length === 0
    ? true
    : interfaces.every((iface) => interfaceValues[`net.ipv6.conf.${iface}.disable_ipv6`] === '1');

  const disableIpv6 = ipv6BaseOk && ipv6IfaceOk;

  const preferIpv4Result = await agent.exec(
    "if [ -f /etc/gai.conf ]; then grep -E '^[[:space:]]*precedence ::ffff:0:0/96[[:space:]]+100' /etc/gai.conf; fi"
  );
  const preferIpv4 = Boolean((preferIpv4Result.stdout || '').trim());

  const sysctlFileResult = await agent.exec(
    "if [ -f /etc/sysctl.d/99-mynode-network.conf ]; then cat /etc/sysctl.d/99-mynode-network.conf; " +
    "elif [ -f /etc/sysctl.conf ]; then awk '/^# MYNODE NETWORK BEGIN$/{flag=1;next}/^# MYNODE NETWORK END$/{flag=0}flag' /etc/sysctl.conf; fi"
  );
  const sysctlContent = sysctlFileResult.stdout || '';

  const managedKeys = new Set<string>([
    'net.core.default_qdisc',
    'net.ipv4.tcp_congestion_control',
    'net.ipv6.conf.all.autoconf',
    'net.ipv6.conf.default.autoconf',
    'net.ipv6.conf.all.accept_ra',
    'net.ipv6.conf.default.accept_ra',
    'net.ipv6.conf.all.disable_ipv6',
    'net.ipv6.conf.default.disable_ipv6',
    'net.ipv6.conf.lo.disable_ipv6',
  ]);
  interfaces.forEach((iface) => managedKeys.add(`net.ipv6.conf.${iface}.disable_ipv6`));

  const customSysctl = extractCustomSysctl(sysctlContent, managedKeys);

  return {
    enableBbrFq,
    disableIpv6,
    preferIpv4,
    customSysctl,
  };
}

async function applyTimezoneConfig(
  agent: ReturnType<typeof agentManager.getAgent>,
  options: z.infer<typeof timezoneSchema>
) {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const tz = options.timezone.replace(/"/g, '');
  const enableNtp = options.enableNtp ? '1' : '0';
  const command = `
set -e
TZ_VALUE=${JSON.stringify(tz)}
ENABLE_NTP=${JSON.stringify(enableNtp)}
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl set-timezone "$TZ_VALUE"
  if [ "$ENABLE_NTP" = "1" ]; then
    timedatectl set-ntp true
  else
    timedatectl set-ntp false
  fi
else
  if [ -f "/usr/share/zoneinfo/$TZ_VALUE" ]; then
    ln -sf "/usr/share/zoneinfo/$TZ_VALUE" /etc/localtime
  fi
  if [ -f /etc/timezone ]; then
    echo "$TZ_VALUE" > /etc/timezone
  fi
  if command -v systemctl >/dev/null 2>&1; then
    if [ "$ENABLE_NTP" = "1" ]; then
      systemctl enable --now systemd-timesyncd || true
      systemctl enable --now chronyd || true
      systemctl enable --now ntp || true
    else
      systemctl disable --now systemd-timesyncd || true
      systemctl disable --now chronyd || true
      systemctl disable --now ntp || true
    fi
  fi
fi
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Apply timezone config failed';
    throw new Error(message);
  }
}

async function fetchTimezoneConfig(
  agent: ReturnType<typeof agentManager.getAgent>
): Promise<z.infer<typeof timezoneSchema>> {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const command = `
set -e
TZ_VALUE=""
NTP_VALUE=""
if command -v timedatectl >/dev/null 2>&1; then
  TZ_VALUE=$(timedatectl show -p Timezone --value 2>/dev/null || true)
  NTP_RAW=$(timedatectl show -p NTP --value 2>/dev/null || true)
  if [ "$NTP_RAW" = "yes" ] || [ "$NTP_RAW" = "true" ] || [ "$NTP_RAW" = "1" ]; then
    NTP_VALUE="1"
  else
    NTP_VALUE="0"
  fi
else
  if [ -f /etc/timezone ]; then
    TZ_VALUE=$(cat /etc/timezone | head -n 1)
  elif [ -L /etc/localtime ]; then
    TZ_VALUE=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')
  fi
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet systemd-timesyncd || systemctl is-active --quiet chronyd || systemctl is-active --quiet ntp; then
      NTP_VALUE="1"
    else
      NTP_VALUE="0"
    fi
  else
    NTP_VALUE="0"
  fi
fi
echo "TZ=$TZ_VALUE"
echo "NTP=$NTP_VALUE"
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Fetch timezone config failed';
    throw new Error(message);
  }

  let timezone = 'UTC';
  let enableNtp = false;
  const lines = (result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('TZ=')) {
      timezone = line.slice(3).trim() || 'UTC';
    } else if (line.startsWith('NTP=')) {
      enableNtp = line.slice(4).trim() === '1';
    }
  }

  return {
    timezone,
    enableNtp,
  };
}

async function applyDnsConfig(
  agent: ReturnType<typeof agentManager.getAgent>,
  options: z.infer<typeof dnsSchema>
) {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const servers = options.servers || [];
  const lines = servers.map((server) => `nameserver ${server}`).join('\n');
  const content = lines.length > 0 ? `${lines}\n` : '';

  const command = `
set -e
cat > /etc/resolv.conf <<'EOF'
${content}EOF
if command -v chattr >/dev/null 2>&1; then
  chattr +i /etc/resolv.conf || true
fi
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Apply DNS config failed';
    throw new Error(message);
  }
}

async function fetchDnsConfig(
  agent: ReturnType<typeof agentManager.getAgent>
): Promise<z.infer<typeof dnsSchema> & { locked: boolean }> {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const readResult = await agent.exec('cat /etc/resolv.conf');
  if (readResult.exitCode !== 0) {
    throw new Error(readResult.stderr || readResult.stdout || 'Failed to read resolv.conf');
  }

  const servers = (readResult.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('nameserver '))
    .map((line) => line.replace('nameserver ', '').trim())
    .filter(Boolean);

  const lockResult = await agent.exec('lsattr /etc/resolv.conf');
  const locked = lockResult.exitCode === 0 && /-i-/.test(lockResult.stdout || '');

  return {
    servers,
    locked,
  };
}

async function applySshConfig(
  agent: ReturnType<typeof agentManager.getAgent>,
  options: z.infer<typeof sshSchema>
) {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const portValue = String(options.port);
  const allowRootLogin = options.allowRootLogin ? 'yes' : 'no';
  const allowPasswordLogin = options.allowPasswordLogin ? 'yes' : 'no';

  const content =
    [
      `Port ${portValue}`,
      `PermitRootLogin ${allowRootLogin}`,
      `PasswordAuthentication ${allowPasswordLogin}`,
    ].join('\n') + '\n';

  const command = `
set -e
SSHD_CONFIG="/etc/ssh/sshd_config"
INCLUDE_DIR="/etc/ssh/sshd_config.d"
MANAGED_FILE="$INCLUDE_DIR/99-mynode.conf"
MARK_BEGIN="# MYNODE SSH BEGIN"
MARK_END="# MYNODE SSH END"

if [ ! -f "$SSHD_CONFIG" ]; then
  echo "sshd_config not found"
  exit 1
fi

if grep -Eiq '^[[:space:]]*Include[[:space:]].*sshd_config\\.d/\\*\\.conf' "$SSHD_CONFIG"; then
  mkdir -p "$INCLUDE_DIR"
  cat > "$MANAGED_FILE" <<'EOF'
${content}EOF
else
  sed -i '/^# MYNODE SSH BEGIN$/,/^# MYNODE SSH END$/d' "$SSHD_CONFIG"
  printf "%s\\n" "$MARK_BEGIN" >> "$SSHD_CONFIG"
  cat >> "$SSHD_CONFIG" <<'EOF'
${content}EOF
  printf "%s\\n" "$MARK_END" >> "$SSHD_CONFIG"
fi

if ! command -v sshd >/dev/null 2>&1; then
  echo "sshd not found"
  exit 1
fi

sshd -t

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart sshd || systemctl restart ssh
elif command -v service >/dev/null 2>&1; then
  service sshd restart || service ssh restart
fi
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Apply SSH config failed';
    throw new Error(message);
  }
}

async function fetchSshConfig(
  agent: ReturnType<typeof agentManager.getAgent>
): Promise<z.infer<typeof sshSchema>> {
  if (!agent) {
    throw new Error('Agent not connected');
  }

  const command = `
set -e
PORT_VALUE=""
ROOT_VALUE=""
PASS_VALUE=""

if command -v sshd >/dev/null 2>&1; then
  EFFECTIVE=$(sshd -T -C user=root,host=localhost,addr=127.0.0.1 2>/dev/null || true)
  if [ -n "$EFFECTIVE" ]; then
    PORT_VALUE=$(echo "$EFFECTIVE" | awk '$1=="port"{print $2; exit}')
    ROOT_VALUE=$(echo "$EFFECTIVE" | awk '$1=="permitrootlogin"{print $2; exit}')
    PASS_VALUE=$(echo "$EFFECTIVE" | awk '$1=="passwordauthentication"{print $2; exit}')
  fi
fi

if [ -z "$PORT_VALUE" ] || [ -z "$ROOT_VALUE" ] || [ -z "$PASS_VALUE" ]; then
  CONF="/etc/ssh/sshd_config"
  if [ -f "$CONF" ]; then
    if [ -z "$PORT_VALUE" ]; then
      PORT_VALUE=$(grep -Ei '^[[:space:]]*Port[[:space:]]+' "$CONF" | tail -n 1 | awk '{print $2}')
    fi
    if [ -z "$ROOT_VALUE" ]; then
      ROOT_VALUE=$(grep -Ei '^[[:space:]]*PermitRootLogin[[:space:]]+' "$CONF" | tail -n 1 | awk '{print $2}')
    fi
    if [ -z "$PASS_VALUE" ]; then
      PASS_VALUE=$(grep -Ei '^[[:space:]]*PasswordAuthentication[[:space:]]+' "$CONF" | tail -n 1 | awk '{print $2}')
    fi
  fi
fi

echo "PORT=$PORT_VALUE"
echo "ROOT=$ROOT_VALUE"
echo "PASS=$PASS_VALUE"
`;

  const result = await agent.exec(command, 60000);
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || 'Fetch SSH config failed';
    throw new Error(message);
  }

  let port = 22;
  let allowRootLogin = false;
  let allowPasswordLogin = false;

  const lines = (result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('PORT=')) {
      const value = parseInt(line.slice(5).trim(), 10);
      if (!Number.isNaN(value)) {
        port = value;
      }
    } else if (line.startsWith('ROOT=')) {
      const value = line.slice(5).trim().toLowerCase();
      allowRootLogin = value === 'yes';
    } else if (line.startsWith('PASS=')) {
      const value = line.slice(5).trim().toLowerCase();
      allowPasswordLogin = value === 'yes';
    }
  }

  return {
    port,
    allowRootLogin,
    allowPasswordLogin,
  };
}
