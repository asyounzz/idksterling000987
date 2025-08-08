const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const app = express();

// Use Render's assigned port
const port = process.env.PORT || 4000;

// Health check endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'BombParty Bot is running!',
    timestamp: new Date().toISOString(),
    discordReady: client.isReady()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load Slash Commands from /commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[WARNING] Command ${file} is missing "data" or "execute".`);
      }
    } catch (error) {
      console.error(`Error loading command ${file}:`, error);
    }
  }
} else {
  console.log('Commands directory not found, skipping command loading.');
}

// Handle All Interactions in a Unified Way
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Slash command
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction, client);
    }

    // Buttons or modals (handled inside the bombparty command file)
    else {
      const command = client.commands.get('bombparty');
      if (command && command.handleComponent) {
        await command.handleComponent(interaction, client);
      }
    }
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
  client.user.setPresence({
    activities: [{ name: 'BombParty', type: 3 }],
    status: 'online',
  });
});

// Error Handling
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

// Start Express server FIRST
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Web server listening on port ${port}`);
  console.log('Bot token exists:', !!process.env.BOTTOKEN);
  
  // Then login to Discord
  if (process.env.BOTTOKEN) {
    client.login(process.env.BOTTOKEN).then(() => {
      console.log('✅ Discord bot logged in successfully');
    }).catch(error => {
      console.error('❌ Discord login failed:', error);
      // Keep the web server running even if Discord login fails
    });
  } else {
    console.error('❌ BOTTOKEN environment variable is not set');
  }
});