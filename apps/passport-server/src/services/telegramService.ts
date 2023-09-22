import { Menu } from "@grammyjs/menu";
import { EdDSATicketPCDPackage } from "@pcd/eddsa-ticket-pcd";
import { constructPassportPcdGetRequestUrl } from "@pcd/passport-interface";
import { ArgumentTypeName } from "@pcd/pcd-types";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import {
  EdDSATicketFieldsToReveal,
  ZKEdDSATicketPCD,
  ZKEdDSATicketPCDArgs,
  ZKEdDSATicketPCDPackage
} from "@pcd/zk-eddsa-ticket-pcd";
import { Bot, InlineKeyboard } from "grammy";
import { Chat, ChatFromGetChat } from "grammy/types";
import sha256 from "js-sha256";
import { fetchPretixEventInfoByName } from "../database/queries/pretixEventInfo";
import { deleteTelegramVerification } from "../database/queries/telegram/deleteTelegramVerification";
import { fetchTelegramVerificationStatus } from "../database/queries/telegram/fetchTelegramConversation";
import { fetchTelegramEventsByEventId } from "../database/queries/telegram/fetchTelegramEvent";
import {
  insertTelegramEvent,
  insertTelegramVerification
} from "../database/queries/telegram/insertTelegramConversation";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { isLocalServer, sleep } from "../util/util";
import { RollbarService } from "./rollbarService";

const SRW_EVENT_ID_STAGING = "3fa6164c-4785-11ee-8178-763dbf30819c";
const SRW_EVENT_ID_PROD = "264b2536-479c-11ee-8153-de1f187f7393";
const TICKETING_PUBKEY_STAGING = [
  "7cf4d97878d663502339c2baae74b12dcdd229279a9f6bfc83b167e808a32d26",
  "c5a04b56d0f2d6b1ec10aa1b17298e31b4a087bdabd4a75d9523779e7dca5a17"
];
const TICKETING_PUBKEY_PROD = [
  "a7da882cd090c14a62b70cf07010c1cabb373b17ebd2d120c9de039ceaedfa24",
  "509e44aa56e97a34e9a54534ef79d484d801757720d18ed872e93dd9de126b09"
];

export class TelegramService {
  private context: ApplicationContext;
  private bot: Bot;
  private rollbarService: RollbarService | null;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null,
    bot: Bot
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
    this.bot = bot;

    this.bot.api.setMyDescription(
      "I'm the Research Workshop ZK bot! I'm managing the Research Workshop Telegram group with ZKPs. Press START to get started!"
    );

    this.bot.api.setMyShortDescription(
      "Research Workshop ZK Bot manages the Research Workshop Telegram group using ZKPs"
    );

    const menu = new Menu("pcdpass-menu");
    this.bot.use(menu);

    // Users gain access to gated chats by requesting to join. The bot
    // receives a notification of this, and will approve requests from
    // users who have verified their possession of a matching PCD.
    // Approval of the join request is required even for users with the
    // invite link - see `creates_join_request` parameter on
    // `createChatInviteLink` API invocation below.
    this.bot.on("chat_join_request", async (ctx) => {
      try {
        const chatId = ctx.chatJoinRequest.chat.id;
        const userId = ctx.chatJoinRequest.user_chat_id;

        logger(`[TELEGRAM] Got chat join request for ${chatId} from ${userId}`);

        // Check if this user is verified for the chat in question
        const isVerified = await fetchTelegramVerificationStatus(
          this.context.dbPool,
          userId,
          chatId
        );

        if (isVerified) {
          logger(
            `[TELEGRAM] Approving chat join request for ${userId} to join ${chatId}`
          );
          await this.bot.api.approveChatJoinRequest(chatId, userId);
          const inviteLink = await ctx.createChatInviteLink();
          await this.bot.api.sendMessage(userId, `You're approved.`, {
            reply_markup: new InlineKeyboard().url(
              `Join`,
              inviteLink.invite_link
            )
          });
          await this.bot.api.sendMessage(userId, `Congrats!`);
        }
      } catch (e) {
        logger("[TELEGRAM] chat_join_request error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // When a user joins the channel, remove their verification, so they
    // cannot rejoin without verifying again.
    this.bot.on("chat_member", async (ctx) => {
      try {
        const newMember = ctx.update.chat_member.new_chat_member;
        if (newMember.status === "member") {
          logger(
            `[TELEGRAM] Deleting verification for user ${newMember.user.id} in chat ${ctx.chat.id}`
          );
          await deleteTelegramVerification(
            this.context.dbPool,
            newMember.user.id,
            ctx.chat.id
          );
        }
      } catch (e) {
        logger("[TELEGRAM] chat_member error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // The "start" command initiates the process of invitation and approval.
    this.bot.command("start", async (ctx) => {
      try {
        // Only process the command if it comes as a private message.
        if (ctx.message && ctx.chat.type === "private") {
          const userId = ctx.message.from.id;

          const fieldsToReveal: EdDSATicketFieldsToReveal = {
            revealTicketId: true,
            revealEventId: true,
            revealProductId: true,
            revealTimestampConsumed: false,
            revealTimestampSigned: false,
            revealAttendeeSemaphoreId: true,
            revealIsConsumed: false,
            revealIsRevoked: false
          };

          const args: ZKEdDSATicketPCDArgs = {
            ticket: {
              argumentType: ArgumentTypeName.PCD,
              pcdType: EdDSATicketPCDPackage.name,
              value: undefined,
              userProvided: true
            },
            identity: {
              argumentType: ArgumentTypeName.PCD,
              pcdType: SemaphoreIdentityPCDPackage.name,
              value: undefined,
              userProvided: true
            },
            fieldsToReveal: {
              argumentType: ArgumentTypeName.Object,
              value: fieldsToReveal,
              userProvided: false
            },
            externalNullifier: {
              argumentType: ArgumentTypeName.BigInt,
              value: undefined,
              userProvided: false
            },
            watermark: {
              argumentType: ArgumentTypeName.BigInt,
              value: userId.toString(),
              userProvided: false
            }
          };

          let passportOrigin = `${process.env.PASSPORT_CLIENT_URL}/`;
          if (passportOrigin === "http://localhost:3000/") {
            // TG bot doesn't like localhost URLs
            passportOrigin = "http://127.0.0.1:3000/";
          }
          const returnUrl = `${process.env.PASSPORT_SERVER_URL}/telegram/verify/${userId}`;

          const proofUrl = constructPassportPcdGetRequestUrl<
            typeof ZKEdDSATicketPCDPackage
          >(passportOrigin, returnUrl, ZKEdDSATicketPCDPackage.name, args, {
            genericProveScreen: true,
            title: "ZK-EdDSA Ticket Request",
            description:
              "Generate a ZK proof that you have a ticket for the research workshop! Select your ticket from the dropdown below."
          });

          menu.webApp("Generate ZKP 🚀", proofUrl);

          await ctx.reply(
            "Welcome! 👋\n\nClick below to ZK prove that you have a ticket to Stanford Research Workshop, so I can add you to the attendee Telegram group!",
            {
              reply_markup: menu
            }
          );
        }
      } catch (e) {
        logger("[TELEGRAM] start error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // The "link <eventName>" command is a dev utility for associating the channel Id with a given event.
    this.bot.command("link", async (ctx) => {
      if (ctx.chat?.type === "private") {
        await ctx.reply(
          "To get you started, can you please add me as an admin to the telegram channel associated with your event? Once you are done, please ping me again with /setup in the channel."
        );
        return;
      }

      const admins = await ctx.getChatAdministrators();
      const isAdmin = admins.some(
        (admin) => admin.user.id === this.bot.botInfo.id
      );
      if (!isAdmin) {
        await ctx.reply(
          "Please add me as an admin to the telegram channel associated with your event."
        );
        return;
      }

      const channelId = ctx.chat.id;
      // TODO: Add menu of possible events
      const eventName = ctx.match;
      if (!eventName) {
        await ctx.reply(
          `Correct usage of this command is: /link <event_name>. Try: /link ProgCrypto (Internal Test)`
        );
        return;
      }

      await ctx.reply("Your telegram channel id is " + ctx.chat.id);

      // TODO: Remove fetchPretixEventInfoByName
      // https://github.com/proofcarryingdata/zupass/issues/662
      try {
        const eventInfo = await fetchPretixEventInfoByName(
          this.context.dbPool,
          eventName
        );
        if (!eventInfo) throw new Error(`Failed to fetch event ${eventName}`);

        await insertTelegramEvent(
          this.context.dbPool,
          eventInfo.pretix_events_config_id,
          channelId
        );
        logger(
          `[TELEGRAM] linked event ${eventName} to group ${ctx.chat.title}`
        );
        await ctx.reply(
          `Linked ${ctx.chat.title} (id: ${channelId}) with event ${eventName}`
        );
      } catch (error) {
        logger(`[ERROR] ${error}`);
        await ctx.reply(
          `Failed to link group to event ${eventName}. Check server logs`
        );
      }
    });
  }

  /**
   * Telegram does not allow two instances of a bot to be running at once.
   * During deployment, a new instance of the app will be started before the
   * old one is shut down, so we might end up with two instances running at
   * the same time. This method allows us to delay starting the bot by an
   * amount configurable per-environment.
   *
   * Since this function awaits on bot.start(), it will likely be very long-
   * lived.
   */
  public async startBot(): Promise<void> {
    const startDelay = parseInt(process.env.TELEGRAM_BOT_START_DELAY_MS ?? "0");
    if (startDelay > 0) {
      logger(`[TELEGRAM] Delaying bot startup by ${startDelay} milliseconds`);
      await sleep(startDelay);
    }

    logger(`[TELEGRAM] Starting bot`);

    try {
      // This will not resolve while the bot remains running.
      await this.bot.start({
        allowed_updates: ["chat_join_request", "chat_member", "message"],
        onStart: (info) => {
          logger(`[TELEGRAM] Started bot '${info.username}' successfully!`);
        }
      });
    } catch (e) {
      logger(`[TELEGRAM] Error starting bot`, e);
      this.rollbarService?.reportError(e);
    }
  }

  public async getBotURL(): Promise<string> {
    const { username } = await this.bot.api.getMe();
    return `https://t.me/${username}`;
  }

  private async verifyPCD(
    serializedZKEdDSATicket: string,
    telegramUserId: number
  ): Promise<ZKEdDSATicketPCD | null> {
    let pcd: ZKEdDSATicketPCD;

    try {
      pcd = await ZKEdDSATicketPCDPackage.deserialize(
        JSON.parse(serializedZKEdDSATicket).pcd
      );
    } catch (e) {
      throw new Error(`Deserialization error, ${e}`);
    }

    // this is very bad but i am very tired
    // hardcoded eventIDs and signing keys for SRW
    let signerMatch = false;
    let eventIdMatch = false;
    if (isLocalServer()) {
      eventIdMatch = true;
      signerMatch = true;
    } else if (process.env.PASSPORT_SERVER_URL?.includes("staging")) {
      // TODO: Replace with better logic to fetch the correct eventId for an arbitrary event
      eventIdMatch = true;
      signerMatch =
        pcd.claim.signer[0] === TICKETING_PUBKEY_STAGING[0] &&
        pcd.claim.signer[1] === TICKETING_PUBKEY_STAGING[1];
    } else {
      eventIdMatch = pcd.claim.partialTicket.eventId === SRW_EVENT_ID_PROD;
      signerMatch =
        pcd.claim.signer[0] === TICKETING_PUBKEY_PROD[0] &&
        pcd.claim.signer[1] === TICKETING_PUBKEY_PROD[1];
    }

    if (
      (await ZKEdDSATicketPCDPackage.verify(pcd)) &&
      pcd.claim.watermark === telegramUserId.toString() &&
      eventIdMatch &&
      signerMatch
    ) {
      return pcd;
    } else {
      return null;
    }
  }

  private async verifyZKEdDSATicketPCD(
    serializedZKEdDSATicket: string
  ): Promise<ZKEdDSATicketPCD | null> {
    let pcd: ZKEdDSATicketPCD;

    try {
      pcd = await ZKEdDSATicketPCDPackage.deserialize(
        JSON.parse(serializedZKEdDSATicket).pcd
      );
    } catch (e) {
      throw new Error(`Deserialization error, ${e}`);
    }

    // this is very bad but i am very tired
    // hardcoded eventIDs and signing keys for SRW
    let signerMatch = false;
    let eventIdMatch = false;
    if (isLocalServer()) {
      eventIdMatch = true;
      signerMatch = true;
    } else if (process.env.PASSPORT_SERVER_URL?.includes("staging")) {
      eventIdMatch = pcd.claim.partialTicket.eventId === SRW_EVENT_ID_STAGING;
      signerMatch =
        pcd.claim.signer[0] === TICKETING_PUBKEY_STAGING[0] &&
        pcd.claim.signer[1] === TICKETING_PUBKEY_STAGING[1];
    } else {
      eventIdMatch = pcd.claim.partialTicket.eventId === SRW_EVENT_ID_PROD;
      signerMatch =
        pcd.claim.signer[0] === TICKETING_PUBKEY_PROD[0] &&
        pcd.claim.signer[1] === TICKETING_PUBKEY_PROD[1];
    }

    if (
      (await ZKEdDSATicketPCDPackage.verify(pcd)) &&
      eventIdMatch &&
      signerMatch
    ) {
      return pcd;
    } else {
      logger("[TELEGRAM] pcd invalid");
      return null;
    }
  }

  private chatIsGroup(
    chat: ChatFromGetChat
  ): chat is Chat.GroupGetChat | Chat.SupergroupGetChat {
    // Chat must be a group chat of some kind
    return (
      chat?.type === "channel" ||
      chat?.type === "group" ||
      chat?.type === "supergroup"
    );
  }

  private async sendToAnonymousChannel(
    groupId: number,
    anonChatId: number,
    message: string
  ): Promise<void> {
    await this.bot.api.sendMessage(groupId, message, {
      message_thread_id: anonChatId
    });
  }

  private async sendInviteLink(
    userId: number,
    chat: Chat.GroupGetChat | Chat.SupergroupGetChat
  ): Promise<void> {
    // Send the user an invite link. When they follow the link, this will
    // trigger a "join request", which the bot will respond to.
    logger(`[TELEGRAM] Creating chat invite link to ${chat.id} for ${userId}`);
    const inviteLink = await this.bot.api.createChatInviteLink(chat.id, {
      creates_join_request: true,
      name: "test invite link"
    });
    await this.bot.api.sendMessage(
      userId,
      `You've generated a ZK proof! Press this button to send your proof to the chat.`,
      {
        reply_markup: new InlineKeyboard().url(
          `Send ZKP`,
          inviteLink.invite_link
        )
      }
    );
  }

  /**
   * Verify that a PCD relates to an event, and that the event has an
   * associated chat. If so, invite the user to the chat and record them
   * for later approval when they request to join.
   *
   * This is called from the /telegram/verify route.
   */
  public async handleVerification(
    serializedZKEdDSATicket: string,
    telegramUserId: number
  ): Promise<void> {
    // Verify PCD
    const pcd = await this.verifyPCD(serializedZKEdDSATicket, telegramUserId);

    if (!pcd) {
      throw new Error(`Could not verify PCD for ${telegramUserId}`);
    }
    const { eventId } = pcd.claim.partialTicket;
    if (!eventId) {
      throw new Error(
        `User ${telegramUserId} returned a ZK-ticket with no eventId.`
      );
    }

    logger(`[TELEGRAM] Verified PCD for ${telegramUserId}, event ${eventId}`);

    // Find the event which matches the PCD
    // For this to work, the `telegram_bot_events` table must be populated.

    const events = await fetchTelegramEventsByEventId(
      this.context.dbPool,
      eventId
    );
    if (!events || events.length === 0) {
      throw new Error(
        `User ${telegramUserId} attempted to use a ticket for event ${eventId}, which has no matching chat`
      );
    }

    const event = events[0];
    // The event is linked to a chat. Make sure we can access it.
    const chatId = event.telegram_chat_id;
    const chat = await this.bot.api.getChat(chatId);
    if (!this.chatIsGroup(chat)) {
      throw new Error(
        `Event ${event.ticket_event_id} is configured with Telegram chat ${event.telegram_chat_id}, which is of incorrect type "${chat.type}"`
      );
    }

    // We've verified that the chat exists, now add the user to our list.
    // This will be important later when the user requests to join.
    await insertTelegramVerification(
      this.context.dbPool,
      telegramUserId,
      event.telegram_chat_id
    );

    // Send invite link
    await this.sendInviteLink(telegramUserId, chat);
  }

  public async handleSendAnonymousMessage(
    serializedZKEdDSATicket: string,
    message: string
  ): Promise<void> {
    logger("[TELEGRAM] Verifying anonymous message");

    const pcd = await this.verifyZKEdDSATicketPCD(serializedZKEdDSATicket);

    if (!pcd) {
      throw new Error("Could not verify PCD for anonymous message");
    }

    const {
      watermark,
      partialTicket: { eventId }
    } = pcd.claim;

    if (!eventId) {
      throw new Error("Anonymous message PCD did not contain eventId");
    }

    if (!watermark) {
      throw new Error("Anonymous message PCD did not contain watermark");
    }

    function getMessageWatermark(message: string): bigint {
      const hashed = sha256.sha256(message).substring(0, 16);
      return BigInt("0x" + hashed);
    }

    if (getMessageWatermark(message).toString() !== watermark.toString()) {
      throw new Error(
        `Anonymous message string ${message} didn't match watermark. got ${watermark} and expected ${getMessageWatermark(
          message
        ).toString()}`
      );
    }

    const events = await fetchTelegramEventsByEventId(
      this.context.dbPool,
      eventId
    );
    if (!events || events.length === 0) {
      throw new Error(
        `Attempted to use a PCD to send anonymous message for event ${eventId}, which is not available`
      );
    }

    logger(
      `[TELEGRAM] Verified PCD for anonynmous message with event ${eventId}`
    );

    const event = events[0];
    if (event.anon_chat_id == null) {
      throw new Error(`this group doesn't have an anon channel`);
    }

    // The event is linked to a chat. Make sure we can access it.
    const chatId = event.telegram_chat_id;
    const chat = await this.bot.api.getChat(chatId);
    if (!this.chatIsGroup(chat)) {
      throw new Error(
        `Event ${event.ticket_event_id} is configured with Telegram chat ${event.telegram_chat_id}, which is of incorrect type "${chat.type}"`
      );
    }

    await this.sendToAnonymousChannel(chat.id, event.anon_chat_id, message);
  }

  public stop(): void {
    this.bot.stop();
  }
}

export async function startTelegramService(
  context: ApplicationContext,
  rollbarService: RollbarService | null
): Promise<TelegramService | null> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger(
      `[INIT] missing TELEGRAM_BOT_TOKEN, not instantiating Telegram service`
    );
    return null;
  }

  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  await bot.init();

  const service = new TelegramService(context, rollbarService, bot);
  // Start the bot, but do not await on the result here.
  service.startBot();

  return service;
}
