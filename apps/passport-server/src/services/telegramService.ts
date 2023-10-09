import { Menu } from "@grammyjs/menu";
import { getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import { sleep } from "@pcd/util";
import {
  ZKEdDSAEventTicketPCD,
  ZKEdDSAEventTicketPCDPackage
} from "@pcd/zk-eddsa-event-ticket-pcd";
import { Bot, InlineKeyboard, session } from "grammy";
import { Chat, ChatFromGetChat } from "grammy/types";
import sha256 from "js-sha256";
import { deleteTelegramVerification } from "../database/queries/telegram/deleteTelegramVerification";
import { fetchTelegramVerificationStatus } from "../database/queries/telegram/fetchTelegramConversation";
import {
  fetchEventsPerChat,
  fetchLinkedPretixAndTelegramEvents,
  fetchTelegramEventByEventId,
  fetchTelegramEventsByChatId
} from "../database/queries/telegram/fetchTelegramEvent";
import {
  insertTelegramEvent,
  insertTelegramVerification
} from "../database/queries/telegram/insertTelegramConversation";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import {
  BotContext,
  SessionData,
  TopicChat,
  chatIDsToChats,
  chatsToJoin,
  dynamicEvents,
  findChatByEventIds,
  getSessionKey,
  isDirectMessage,
  isGroupWithTopics,
  senderIsAdmin
} from "../util/telegramHelpers";
import { RollbarService } from "./rollbarService";

const ALLOWED_TICKET_MANAGERS = [
  "cha0sg0d",
  "notdavidhuang",
  "richardyliu",
  "gubsheep",
  "chubivan"
];

const adminBotChannel = "Admin Central";

export class TelegramService {
  private context: ApplicationContext;
  private bot: Bot<BotContext>;
  private rollbarService: RollbarService | null;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null,
    bot: Bot<BotContext>
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
    this.bot = bot;

    this.bot.api.setMyDescription(
      "I'm Zucat 🐱 ! I manage fun events with zero-knowledge proofs. Press START to get started!"
    );

    this.bot.api.setMyShortDescription(
      "Zucat manages events and groups with zero-knowledge proofs"
    );

    const zupassMenu = new Menu<BotContext>("zupass");
    const eventsMenu = new Menu<BotContext>("events");
    const anonSendMenu = new Menu("anonsend");

    // Uses the dynamic range feature of Grammy menus https://grammy.dev/plugins/menu#dynamic-ranges
    // /link and /unlink are unstable right now, pending fixes
    eventsMenu.dynamic(dynamicEvents);
    zupassMenu.dynamic(chatsToJoin);

    anonSendMenu.dynamic((_, menu) => {
      const zktgUrl =
        process.env.TELEGRAM_ANON_WEBSITE ?? "https://dev.local:4000/";
      menu.webApp("Send anonymous message", zktgUrl);
      return menu;
    });

    this.bot.use(eventsMenu);
    this.bot.use(zupassMenu);
    this.bot.use(anonSendMenu);

    // Users gain access to gated chats by requesting to join. The bot
    // receives a notification of this, and will approve requests from
    // users who have verified their possession of a matching PCD.
    // Approval of the join request is required even for users with the
    // invite link - see `creates_join_request` parameter on
    // `createChatInviteLink` API invocation below.
    this.bot.on("chat_join_request", async (ctx) => {
      const userId = ctx.chatJoinRequest.user_chat_id;

      try {
        const chatId = ctx.chatJoinRequest.chat.id;

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
          const chat = (await ctx.api.getChat(chatId)) as TopicChat;

          await this.bot.api.sendMessage(
            userId,
            `<i>Verifying and inviting...</i>`,
            { parse_mode: "HTML" }
          );
          await this.bot.api.approveChatJoinRequest(chatId, userId);
          if (ctx.chatJoinRequest?.invite_link?.invite_link) {
            await this.bot.api.sendMessage(userId, `Congrats!`, {
              reply_markup: new InlineKeyboard().url(
                `Go to ${chat?.title} `,
                ctx.chatJoinRequest.invite_link.invite_link
              ),
              parse_mode: "HTML"
            });
          } else {
            await this.bot.api.sendMessage(
              userId,
              `Congrats! ${chat?.title} should now appear at the top of your list
               of Chats.\nYou can also click the above button.`
            );
          }
        } else {
          await this.bot.api.sendMessage(
            userId,
            `You are not verified. Try again with the /start command.`
          );
        }
      } catch (e) {
        await this.bot.api.sendMessage(userId, `Error joining: ${e}`);
        logger("[TELEGRAM] chat_join_request error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // When a user joins the channel, remove their verification, so they
    // cannot rejoin without verifying again.
    this.bot.on("chat_member", async (ctx) => {
      try {
        const newMember = ctx.update.chat_member.new_chat_member;
        if (newMember.status === "left" || newMember.status === "kicked") {
          logger(
            `[TELEGRAM] Deleting verification for user leaving ${newMember.user.username} in chat ${ctx.chat.id}`
          );
          await deleteTelegramVerification(
            this.context.dbPool,
            newMember.user.id,
            ctx.chat.id
          );
          const chat = (await ctx.api.getChat(ctx.chat.id)) as TopicChat;
          const userId = newMember.user.id;
          await this.bot.api.sendMessage(
            userId,
            `<i>You left ${chat?.title}. To join again, you must re-verify by typing /start.</i>`,
            { parse_mode: "HTML" }
          );
        }
      } catch (e) {
        logger("[TELEGRAM] chat_member error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // The "start" command initiates the process of invitation and approval.
    this.bot.command("start", async (ctx) => {
      const userId = ctx?.from?.id;
      try {
        // Only process the command if it comes as a private message.
        if (isDirectMessage(ctx) && userId) {
          const username = ctx?.from?.username;
          const firstName = ctx?.from?.first_name;
          const name = firstName || username;
          await ctx.reply(
            `Welcome ${name}! 👋\n\nClick below join a TG group via a ZK proof!\n\nYou will sign in to Zupass, then prove you have a ticket for one of the events associated with the group.\n\nSee you soon 😽`,
            { reply_markup: zupassMenu }
          );
        }
      } catch (e) {
        logger("[TELEGRAM] start error", e);
        this.rollbarService?.reportError(e);
      }
    });

    // The "link <eventName>" command is a dev utility for associating the channel Id with a given event.
    this.bot.command("manage", async (ctx) => {
      const messageThreadId = ctx?.message?.message_thread_id;

      try {
        const admins = await ctx.getChatAdministrators();
        const username = ctx?.from?.username;
        if (!username) throw new Error(`Username not found`);

        if (!(await senderIsAdmin(ctx, admins)))
          throw new Error(`Only admins can run this command`);
        if (!ALLOWED_TICKET_MANAGERS.includes(username))
          throw new Error(
            `Only Zupass team members are allowed to run this command.`
          );

        if (!isGroupWithTopics(ctx)) {
          await ctx.reply(
            "This command only works in a group with Topics enabled.",
            { message_thread_id: messageThreadId }
          );
        }

        if (messageThreadId)
          return ctx.reply(`Must be in ${adminBotChannel}.`, {
            message_thread_id: messageThreadId
          });

        const botIsAdmin = admins.some(
          (admin) => admin.user.id === this.bot.botInfo.id
        );
        if (!botIsAdmin) {
          await ctx.reply(
            "Please add me as an admin to the telegram channel associated with your event.",
            { message_thread_id: messageThreadId }
          );
          return;
        }

        ctx.reply(
          `Choose an event to manage.\n\n <i>✅ = this chat is gated by event.</i>`,
          {
            reply_markup: eventsMenu,
            parse_mode: "HTML",
            message_thread_id: messageThreadId
          }
        );
      } catch (error) {
        await ctx.reply(`${error}`, { message_thread_id: messageThreadId });
        logger(`[TELEGRAM] ERROR`, error);
      }
    });

    this.bot.command("setup", async (ctx) => {
      const messageThreadId = ctx?.message?.message_thread_id;
      try {
        if (!isGroupWithTopics(ctx)) {
          throw new Error("Please enable topics for this group and try again");
        }

        if (ctx?.message?.is_topic_message)
          throw new Error(`Cannot run setup from an existing topic`);

        await ctx.editGeneralForumTopic(adminBotChannel);
        await ctx.hideGeneralForumTopic();
        const topic = await ctx.createForumTopic(`Announcements`, {
          icon_custom_emoji_id: "5309984423003823246" // 📢
        });
        await ctx.api.closeForumTopic(ctx.chat.id, topic.message_thread_id);
      } catch (error) {
        await ctx.reply(`❌ ${error}`, {
          reply_to_message_id: messageThreadId
        });
      }
    });

    this.bot.command("adminhelp", async (ctx) => {
      const messageThreadId = ctx?.message?.message_thread_id;
      await ctx.reply(
        `<b>Help</b>
    
        <b>Admins</b>
        <b>/manage</b> - Gate / Ungate this group with a ticketed event
        <b>/setup</b> - When the chat is created, hide the general channel and set up Announcements.
        <b>/incognito</b> - Mark a topic as anonymous
      `,
        { parse_mode: "HTML", reply_to_message_id: messageThreadId }
      );
      const msg = await ctx.reply(`Loading tickets and events...`);
      const events = await fetchLinkedPretixAndTelegramEvents(
        this.context.dbPool
      );
      const eventsWithChats = await chatIDsToChats(
        this.context.dbPool,
        ctx,
        events
      );

      const userId = ctx.from?.id;
      if (!userId) throw new Error(`No user found. Try again...`);
      if (eventsWithChats.length === 0) {
        return ctx.api.editMessageText(
          userId,
          msg.message_id,
          `No chats found to join. If you are an admin of a group, you can add me and type /manage to link an event.`,
          {
            parse_mode: "HTML"
          }
        );
      }

      let eventsHtml = `<b> Current Chats with Events </b>\n\n`;

      for (const event of eventsWithChats) {
        if (event.chat?.title)
          eventsHtml += `Event: <b>${event.eventName}</b> ➡ Chat: <i>${event.chat.title}</i>\n`;
      }
      await ctx.api.editMessageText(userId, msg.message_id, eventsHtml, {
        parse_mode: "HTML"
      });
    });

    this.bot.command("anonsend", async (ctx) => {
      if (!isDirectMessage(ctx)) {
        const messageThreadId = ctx.message?.message_thread_id;
        const chatId = ctx.chat.id;

        // if there is a message_thread_id or a chat_id, use reply settings.
        const replyOptions = messageThreadId
          ? { message_thread_id: messageThreadId }
          : chatId
          ? {}
          : undefined;

        if (replyOptions) {
          await ctx.reply(
            "Please message directly within a private chat.",
            replyOptions
          );
        }
        return;
      }

      await ctx.reply("Click below to anonymously send a message.", {
        reply_markup: anonSendMenu
      });
    });

    this.bot.command("incognito", async (ctx) => {
      const messageThreadId = ctx.message?.message_thread_id;
      if (!messageThreadId) {
        logger("[TELEGRAM] message thread id not found");
        return;
      }

      if (!isGroupWithTopics(ctx)) {
        await ctx.reply(
          "This command only works in a group with Topics enabled.",
          { message_thread_id: messageThreadId }
        );
      }

      if (!(await senderIsAdmin(ctx)))
        return ctx.reply(`Only admins can run this command`);

      try {
        const telegramEvents = await fetchTelegramEventsByChatId(
          this.context.dbPool,
          ctx.chat.id
        );
        const hasLinked = telegramEvents.length > 0;
        if (!hasLinked) {
          await ctx.reply(
            "This group is not linked to an event. Please use /link to link this group to an event.",
            { message_thread_id: messageThreadId }
          );
          return;
        } else if (telegramEvents.filter((e) => e.anon_chat_id).length > 0) {
          await ctx.reply(
            `This group has already linked an anonymous channel.`,
            { message_thread_id: messageThreadId }
          );
          return;
        }

        await insertTelegramEvent(
          this.context.dbPool,
          telegramEvents[0].ticket_event_id,
          telegramEvents[0].telegram_chat_id,
          messageThreadId
        );

        await ctx.reply(
          `Successfully linked anonymous channel. DM me with /anonsend to anonymously send a message.`,
          { message_thread_id: messageThreadId }
        );
      } catch (error) {
        logger(`[ERROR] ${error}`);
        await ctx.reply(`Failed to link anonymous chat. Check server logs`, {
          message_thread_id: messageThreadId
        });
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
        allowed_updates: [
          "chat_join_request",
          "chat_member",
          "message",
          "callback_query"
        ],
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

  private async verifyZKEdDSAEventTicketPCD(
    serializedZKEdDSATicket: string
  ): Promise<ZKEdDSAEventTicketPCD | null> {
    let pcd: ZKEdDSAEventTicketPCD;

    try {
      pcd = await ZKEdDSAEventTicketPCDPackage.deserialize(
        JSON.parse(serializedZKEdDSATicket).pcd
      );
    } catch (e) {
      throw new Error(`Deserialization error, ${e}`);
    }

    let signerMatch = false;

    if (!process.env.SERVER_EDDSA_PRIVATE_KEY)
      throw new Error(`Missing server eddsa private key .env value`);

    // This Pubkey value should work for staging + prod as well, but needs to be tested
    const TICKETING_PUBKEY = await getEdDSAPublicKey(
      process.env.SERVER_EDDSA_PRIVATE_KEY
    );

    signerMatch =
      pcd.claim.signer[0] === TICKETING_PUBKEY[0] &&
      pcd.claim.signer[1] === TICKETING_PUBKEY[1];

    if (
      // TODO: wrap in a MultiProcessService?
      (await ZKEdDSAEventTicketPCDPackage.verify(pcd)) &&
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

    logger(
      `[TELEGRAM] Creating chat invite link to ${chat.title}(${chat.id}) for ${userId}`
    );
    const inviteLink = await this.bot.api.createChatInviteLink(chat.id, {
      creates_join_request: true,
      name: `${Date.now().toLocaleString()}`
    });
    await this.bot.api.sendMessage(
      userId,
      `You've proved that you have a ticket to <b>${chat.title}</b>!\nPress this button to send your proof and join the group`,
      {
        reply_markup: new InlineKeyboard().url(
          `Send ZK Proof ✈️`,
          inviteLink.invite_link
        ),
        parse_mode: "HTML"
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
    const pcd = await this.verifyZKEdDSAEventTicketPCD(serializedZKEdDSATicket);

    if (!pcd) {
      throw new Error(`Could not verify PCD for ${telegramUserId}`);
    }
    const { watermark } = pcd.claim;

    if (!watermark) {
      throw new Error("Verification PCD did not contain watermark");
    }

    if (telegramUserId.toString() !== watermark.toString()) {
      throw new Error(
        `Telegram User id ${telegramUserId} does not match given watermark ${watermark}`
      );
    }

    const { attendeeSemaphoreId } = pcd.claim.partialTicket;

    if (!attendeeSemaphoreId) {
      throw new Error(
        `User ${telegramUserId} did not reveal their semaphore id`
      );
    }

    const { validEventIds } = pcd.claim;
    if (!validEventIds) {
      throw new Error(
        `User ${telegramUserId} did not submit any valid event ids`
      );
    }

    const eventsByChat = await fetchEventsPerChat(this.context.dbPool);
    const telegramChatId = findChatByEventIds(eventsByChat, validEventIds);
    if (!telegramChatId) {
      throw new Error(
        `User ${telegramUserId} attempted to use a ticket for events ${validEventIds.join(
          ","
        )}, which have no matching chat`
      );
    }
    const chat = await this.bot.api.getChat(telegramChatId);

    logger(`[TELEGRAM] Verified PCD for ${telegramUserId}, chat ${chat}`);

    if (!this.chatIsGroup(chat)) {
      throw new Error(
        `Event is configured with Telegram chat ${chat.id}, which is of incorrect type "${chat.type}"`
      );
    }

    // We've verified that the chat exists, now add the user to our list.
    // This will be important later when the user requests to join.
    await insertTelegramVerification(
      this.context.dbPool,
      telegramUserId,
      parseInt(telegramChatId),
      attendeeSemaphoreId
    );

    // Send invite link
    await this.sendInviteLink(telegramUserId, chat);
  }

  public async handleSendAnonymousMessage(
    serializedZKEdDSATicket: string,
    message: string
  ): Promise<void> {
    logger("[TELEGRAM] Verifying anonymous message");

    const pcd = await this.verifyZKEdDSAEventTicketPCD(serializedZKEdDSATicket);

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

    const event = await fetchTelegramEventByEventId(
      this.context.dbPool,
      eventId
    );
    if (!event) {
      throw new Error(
        `Attempted to use a PCD to send anonymous message for event ${eventId}, which is not available`
      );
    }

    logger(
      `[TELEGRAM] Verified PCD for anonynmous message with event ${eventId}`
    );

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

  const bot = new Bot<BotContext>(process.env.TELEGRAM_BOT_TOKEN);
  const initial = (): SessionData => {
    return { dbPool: context.dbPool };
  };

  bot.use(session({ initial, getSessionKey }));
  await bot.init();

  const service = new TelegramService(context, rollbarService, bot);
  bot.catch((error) => {
    logger(`[TELEGRAM] Bot error`, error);
  });
  // Start the bot, but do not await on the result here.
  service.startBot();

  return service;
}
