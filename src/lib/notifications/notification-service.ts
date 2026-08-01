/**
 * ZenZebra CRM Notification Framework
 * Multi-channel notification service (In-App, Webhooks, Email, Slack).
 */

export interface NotificationPayload {
	id: string;
	title: string;
	message: string;
	channel: "in-app" | "webhook" | "email" | "slack";
	recipient: string;
	severity: "info" | "warning" | "error" | "success";
	timestamp: string;
	metadata?: Record<string, any>;
}

class NotificationService {
	public async sendNotification(
		notification: Omit<NotificationPayload, "id" | "timestamp">,
	): Promise<void> {
		const fullPayload: NotificationPayload = {
			...notification,
			id: `notif_${Math.random().toString(36).substring(2, 9)}`,
			timestamp: new Date().toISOString(),
		};

		if (process.env.NODE_ENV === "development") {
			console.log(
				`[NOTIFICATION] [${fullPayload.channel.toUpperCase()}] To: ${fullPayload.recipient} | ${fullPayload.title}: ${fullPayload.message}`,
			);
		}

		// Webhook dispatch if configured
		if (
			notification.channel === "webhook" &&
			process.env.NOTIFICATION_WEBHOOK_URL
		) {
			try {
				await fetch(process.env.NOTIFICATION_WEBHOOK_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(fullPayload),
				});
			} catch (err) {
				console.error("Failed to send webhook notification:", err);
			}
		}
	}
}

export const notificationService = new NotificationService();
