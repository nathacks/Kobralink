import fs from 'node:fs';
import path from 'node:path';
import { eventLinkPath, type KobralinkEvent, type PushSubscriptionInput } from '@kobralink/shared';
import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const GONE = new Set([404, 410]);
const FALLBACK_SUBJECT = 'https://github.com/nathacks/Kobralink';

@Injectable()
export class PushService {
    private readonly log = new Logger(PushService.name);
    private vapid: { publicKey: string; privateKey: string } | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    private keys(): { publicKey: string; privateKey: string } {
        if (this.vapid) return this.vapid;
        const file = path.join(loadEnv().dataDir, '.vapid.json');
        try {
            this.vapid = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            this.vapid = webpush.generateVAPIDKeys();
            fs.writeFileSync(file, JSON.stringify(this.vapid), { mode: 0o600 });
        }
        return this.vapid as { publicKey: string; privateKey: string };
    }

    publicKey(): string {
        return this.keys().publicKey;
    }

    async subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
        const data = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
        await this.prisma.client.pushSubscription.upsert({
            where: { endpoint: sub.endpoint },
            create: { endpoint: sub.endpoint, ...data },
            update: data,
        });
    }

    async unsubscribe(endpoint: string): Promise<void> {
        await this.prisma.client.pushSubscription.deleteMany({ where: { endpoint } });
    }

    async hasSubscribers(): Promise<boolean> {
        return (await this.prisma.client.pushSubscription.count()) > 0;
    }

    private subject(): string {
        const url = this.settings.get().publicUrl || loadEnv().baseUrl;
        return url.startsWith('https://') && !new URL(url).hostname.startsWith('localhost') ? url : FALLBACK_SUBJECT;
    }

    async send(event: KobralinkEvent): Promise<void> {
        const subs = await this.prisma.client.pushSubscription.findMany();
        if (!subs.length) return;
        const { publicKey, privateKey } = this.keys();
        const payload = JSON.stringify({
            title: event.title,
            body: event.body,
            tag: event.id,
            url: event.url ?? eventLinkPath(event.type, event.printerId),
        });
        const options = {
            vapidDetails: { subject: this.subject(), publicKey, privateKey },
            TTL: 3600,
            urgency: event.type.startsWith('alert') ? ('high' as const) : ('normal' as const),
        };
        const errors: string[] = [];
        await Promise.all(
            subs.map((s) =>
                webpush
                    .sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        payload,
                        options,
                    )
                    .catch(async (e: { statusCode?: number; message: string }) => {
                        if (e.statusCode && GONE.has(e.statusCode)) {
                            await this.unsubscribe(s.endpoint);
                            this.log.log(`Dropped expired push subscription ${s.id}`);
                        } else errors.push(e.message);
                    }),
            ),
        );
        if (errors.length === subs.length) throw new Error(errors[0]);
    }
}
