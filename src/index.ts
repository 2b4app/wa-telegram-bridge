import makeWASocket, {
	Browsers,
	DisconnectReason,
	downloadMediaMessage,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Bot, InputFile } from "grammy";
import pino from "pino";

const TELEGRAM_BOT_TOKEN = required("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = required("TELEGRAM_CHAT_ID");

const WHATSAPP_GROUP_JID = required("WHATSAPP_GROUP_JID");
const WHATSAPP_PHONE_NUMBER = required("WHATSAPP_PHONE_NUMBER");

const AUTH_DIR = "/data/auth";

const logger = pino({
	level: process.env.LOG_LEVEL ?? "info",
});

const telegram = new Bot(TELEGRAM_BOT_TOKEN);

function required(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}

	return value;
}

function senderName(message: any): string {
	return (
		message.pushName || message.key?.participant?.split("@")[0] || "Unknown"
	);
}

function getText(message: any): string | undefined {
	const content = message.message;

	if (!content) {
		return undefined;
	}

	return (
		content.conversation ||
		content.extendedTextMessage?.text ||
		content.imageMessage?.caption ||
		content.videoMessage?.caption ||
		content.documentMessage?.caption
	);
}

async function forwardMessage(message: any) {
	const content = message.message;

	if (!content) {
		return;
	}

	const name = senderName(message);
	const text = getText(message);

	// Text message
	if (text && !content.imageMessage && !content.videoMessage) {
		await telegram.api.sendMessage(
			TELEGRAM_CHAT_ID,
			`[WhatsApp] ${name}:\n${text}`,
		);

		return;
	}

	// Image
	if (content.imageMessage) {
		const image = await downloadMediaMessage(message, "buffer", {});

		await telegram.api.sendPhoto(
			TELEGRAM_CHAT_ID,
			new InputFile(image, "image.jpg"),
			{
				caption:
					`[WhatsApp] ${name}` +
					(content.imageMessage.caption
						? `:\n${content.imageMessage.caption}`
						: ""),
			},
		);

		return;
	}

	logger.info(
		{
			type: Object.keys(content)[0],
			sender: name,
		},
		"Unsupported WhatsApp message type",
	);
}

async function logGroups(sock: any) {
	try {
		const groups = await sock.groupFetchAllParticipating();

		logger.info(
			{
				count: Object.keys(groups).length,
				configured: WHATSAPP_GROUP_JID,
			},
			"Participating WhatsApp groups",
		);

		for (const [jid, group] of Object.entries(groups) as any) {
			const isConfigured = jid === WHATSAPP_GROUP_JID;

			logger.info(
				{ jid, name: group.subject, isConfigured },
				"Group",
			);
		}
	} catch (error) {
		logger.error({ error }, "Failed to list WhatsApp groups");
	}
}

async function startWhatsApp(): Promise<void> {
	const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

	const sock = makeWASocket({
		auth: state,
		// The browser name doubles as `companion_platform_display` in the
		// pairing-code request, which WhatsApp validates against a fixed set
		// (Chrome/Edge/Firefox/IE/Opera/Safari) — "Desktop" gets rejected.
		browser: Browsers.macOS("Chrome"),
		logger,
		markOnlineOnConnect: false,
		syncFullHistory: false,
	});

	sock.ev.on("creds.update", saveCreds);

	if (!state.creds.registered) {
		// `connection: "open"` only fires after a successful login, so a fresh
		// (unregistered) socket never reaches the pairing code logic there.
		// Wait for the registration handshake, then request the code once.
		setTimeout(async () => {
			try {
				const phone = WHATSAPP_PHONE_NUMBER.replace(/\D/g, "");

				const code = await sock.requestPairingCode(phone);

				logger.info(`WhatsApp pairing code: ${code}`);

				logger.info(
					"On your phone: WhatsApp → Settings → Linked Devices → Link a device → Link with phone number",
				);
			} catch (error) {
				logger.error({ error }, "Failed to request WhatsApp pairing code");
			}
		}, 6000);
	}

	sock.ev.on("connection.update", async (update) => {
		const { connection, lastDisconnect } = update;

		if (connection === "connecting") {
			logger.info("Connecting to WhatsApp...");
		}

		if (connection === "close") {
			const statusCode = (lastDisconnect?.error as any)?.output
				?.statusCode;

			const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

			logger.warn(
				{ statusCode, shouldReconnect },
				"WhatsApp connection closed",
			);

			if (shouldReconnect) {
				await startWhatsApp();
			} else {
				logger.error(
					"WhatsApp logged out. Delete /data/auth and pair again.",
				);
			}
		}

		if (connection === "open") {
			logger.info("Connected to WhatsApp");

			await logGroups(sock);
		}
	});

	sock.ev.on("messages.upsert", async ({ messages }) => {
		for (const message of messages) {
			try {
				// Ignore messages sent by the bridge's own WhatsApp account.
				if (message.key.fromMe) {
					continue;
				}

				// Only process the configured group.
				if (message.key.remoteJid !== WHATSAPP_GROUP_JID) {
					continue;
				}

				await forwardMessage(message);

				logger.info(
					{
						jid: message.key.remoteJid,
						sender: senderName(message),
					},
					"Message forwarded",
				);
			} catch (error) {
				logger.error({ error }, "Failed to forward WhatsApp message");
			}
		}
	});
}

async function main() {
	// Verify Telegram credentials before starting WhatsApp.
	const me = await telegram.api.getMe();

	logger.info(
		{
			username: me.username,
			telegramChatId: TELEGRAM_CHAT_ID,
		},
		"Telegram bot initialized",
	);

	await startWhatsApp();
}

main().catch((error) => {
	logger.error(error);
	process.exit(1);
});
