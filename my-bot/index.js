const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const app = express();
const port = process.env.PORT || 4000;

app.get('/', (req, res) => res.send('BombParty Bot is running!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Memory optimization options
  makeCache: require('discord.js').Options.cacheWithLimits({
    ApplicationCommandManager: 0, // Don't cache application commands
    BaseGuildEmojiManager: 0, // Don't cache emojis
    GuildBanManager: 0, // Don't cache bans
    GuildInviteManager: 0, // Don't cache invites
    GuildScheduledEventManager: 0, // Don't cache events
    MessageManager: 50, // Only cache 50 messages per channel
    PresenceManager: 0, // Don't cache presences
    ReactionManager: 0, // Don't cache reactions
    ReactionUserManager: 0, // Don't cache reaction users
    StageInstanceManager: 0, // Don't cache stage instances
    ThreadManager: 0, // Don't cache threads
    ThreadMemberManager: 0, // Don't cache thread members
    UserManager: 100, // Only cache 100 users
    VoiceStateManager: 0, // Don't cache voice states
  }),
  sweepers: {
    messages: {
      interval: 300, // Sweep every 5 minutes
      lifetime: 1800, // Remove messages older than 30 minutes
    },
    users: {
      interval: 3600, // Sweep every hour
      lifetime: 14400, // Remove users not seen for 4 hours
    },
  },
});

client.commands = new Collection();

// Load Slash Commands from /commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] Command ${file} is missing "data" or "execute".`);
    }
  }
}

// Memory Management Functions
function performMemoryCleanup() {
  let cleaned = 0;

  // Clear old messages from all channels
  client.channels.cache.forEach(channel => {
    if (channel.messages) {
      const oldSize = channel.messages.cache.size;
      channel.messages.cache.clear();
      cleaned += oldSize;
    }
  });

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} cached items. Memory: ${heapUsedMB}MB`);
  }

  return heapUsedMB;
}

function emergencyCleanup() {
  console.log('🚨 Emergency memory cleanup initiated...');

  // More aggressive cleanup
  let cleaned = 0;

  // Clear all message caches
  client.channels.cache.forEach(channel => {
    if (channel.messages) {
      cleaned += channel.messages.cache.size;
      channel.messages.cache.clear();
    }
  });

  // Clear user cache (keep only recent ones)
  const recentThreshold = Date.now() - (30 * 60 * 1000); // 30 minutes
  const usersToRemove = [];

  client.users.cache.forEach(user => {
    if (!user.lastMessageTimestamp || user.lastMessageTimestamp < recentThreshold) {
      usersToRemove.push(user.id);
    }
  });

  usersToRemove.forEach(userId => {
    client.users.cache.delete(userId);
  });

  // Force garbage collection multiple times
  if (global.gc) {
    global.gc();
    setTimeout(() => global.gc(), 1000);
  }

  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

  console.log(`🧹 Emergency cleanup: ${cleaned + usersToRemove.length} items cleared. Memory: ${heapUsedMB}MB`);
}

// Automatic Memory Management
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

  // Emergency cleanup if memory usage is high
  if (heapUsedMB > 400) { // Adjust threshold based on your limits
    emergencyCleanup();
  }
  // Regular cleanup if memory usage is moderate
  else if (heapUsedMB > 250) {
    performMemoryCleanup();
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Regular cleanup regardless of memory usage
setInterval(() => {
  performMemoryCleanup();
}, 30 * 60 * 1000); // Clean every 30 minutes

// Handle Interactions
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Only handle slash commands here
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction, client);
      }
    }
    // Button and other component interactions are handled by collectors within commands
    // No need to handle them globally
  } catch (error) {
    console.error('❌ Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

// On Ready
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Log initial memory usage
  const memUsage = process.memoryUsage();
  console.log(`💾 Initial memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);

  client.user.setPresence({
    activities: [{ name: 'with words n bombs', type: 1 }],
    status: 'online',
  });

  // Start memory monitoring
  console.log('🔍 Memory monitoring started');
});

// Memory monitoring with auto-restart for Render
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

  // Log memory usage every 10 minutes for monitoring
  console.log(`💾 Memory: ${heapUsedMB.toFixed(2)}MB | Cache: ${client.users.cache.size} users, ${client.channels.cache.size} channels`);

  // If approaching memory limit, gracefully restart (Render will auto-restart)
  if (heapUsedMB > 450) { // Adjust based on your plan limits
    console.log('🚨 Memory limit approaching, initiating graceful restart...');
    console.log('📊 Final stats:', {
      memory: `${heapUsedMB.toFixed(2)}MB`,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      channels: client.channels.cache.size
    });

    // Gracefully disconnect and let Render restart
    client.destroy();
    process.exit(0);
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Error Handling
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  // Don't exit immediately, let the bot try to recover
});

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
  // Don't exit immediately, let the bot try to recover
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, gracefully shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, gracefully shutting down...');
  client.destroy();
  process.exit(0);
});

// Login
client.login(process.env.BOTTOKEN);