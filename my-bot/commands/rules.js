const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("howtoplay")
    .setDescription("Show the complete BombParty Guide"),

  async execute(interaction) {
    // Pages content
    const pages = [
      {
        title: "🎯 Game Overview",
        description: `BombParty is a fast-paced word game where players must quickly type words containing a given letter sequence. The last player standing wins!`,
      },
      {
        title: "🚀 Getting Started - Creating a Lobby",
        description: `**Creating a Lobby**\n- Use \`/lobby [max_players]\` to create a new game lobby\n- Max players: 2-6 players\n- The creator becomes the lobby owner`,
      },
      {
        title: "🚀 Getting Started - Lobby Settings",
        description: `**Lobby Settings (Owner Only)**\n- **Language**: English or French dictionaries\n- **Lives**: 1, 3 or 5 lives per player\n- **Turn Time**: 10, 15 or 20 seconds per turn`,
      },
      {
        title: "🚀 Getting Started - Joining & Managing Players",
        description: `- Click "Join Game" to enter a lobby\n- Players can leave (except the owner)\n- Owner can transfer ownership to another player\n- Owner can ban disruptive players\n- Need at least 2 players to start`,
      },
      {
        title: "🎮 Gameplay Rules - Basic Turn Structure",
        description: `1. A random letter sequence (2-3 letters) is displayed\n2. Current player has 10/15/200 seconds (based on settings) to respond\n3. Player must type a valid word containing that exact sequence\n4. Turn moves to the next player with a new sequence`,
      },
      {
        title: "🎮 Gameplay Rules - Valid Word Requirements",
        description: `A word is valid if it:\n- ✅ Exists in the game dictionary\n- ✅ Contains the exact letter sequence anywhere in the word\n- ✅ Hasn't been used before in this game`,
      },
      {
        title: "🎮 Gameplay Rules - Invalid Word Consequences",
        description: `If you submit an invalid word:\n- ❌ Your timer resets (you get another chance)\n- ❌ No life is lost, but you waste precious time\n- The game shows why it was invalid (not in dictionary, missing sequence, or already used)`,
      },
      {
        title: "🎮 Gameplay Rules - Losing Lives & Elimination",
        description: `**Losing Lives**:\n- ⏰ Your turn timer expires (timeout)\n- You'll get a new sequence after losing a life\n\n**Elimination**:\n- When you reach 0 lives, you're eliminated\n- Game continues until only one player remains\n- The last surviving player wins!`,
      },
      {
        title: "🔠 Alphabet Challenge System",
        description: `**Personal Letter Tracking**\n- Each player has their own alphabet progress (A-V)\n- 🔴 = used letters, 🔵 = unused letters\n\n**Bonus Life Reward**\n- Complete your alphabet for +1 life\n- Alphabet resets after earning bonus`,
      },
      {
        title: "🎲 Game Mechanics",
        description: `**Sequence Generation**:\n- 2-3 letters long, avoids last 5 repeats\n- Always exists in valid words\n\n**Word Dictionary**:\n- English or French\n- No proper nouns or abbreviations\n\n**Turn Order**:\n- Based on join order\n- Skips eliminated players`,
      },
      {
        title: "📊 Game Statistics Display",
        description: `**Real-Time Info**:\n- Current sequence\n- Players & lives (❤️)\n- Elapsed time\n- Words played\n- Last 5 events\n- Your used letters`,
      },
      {
        title: "🎮 Controls & Interface",
        description: `**During Lobby Phase**:\n- Join/Leave\n- Settings menu (owner only)\n- Start game (2+ players)\n- Transfer ownership / Ban / Cancel room\n\n**During Game**:\n- Type your word\n- Stop game (owner only)\n- Auto-delete messages\n\n**After Game**:\n- Back to lobby / Close lobby\n- Auto close after 5 min`,
      },
      {
        title: "⚠️ Important Rules & Tips",
        description: `**Timing**:\n- Timer starts immediately\n- No pauses\n\n**Word Strategy**:\n- Longer words help with alphabet\n- Avoid repeats\n- Plan ahead\n\n**Fair Play**:\n- Case-insensitive\n- Only A-V count\n\n**Lobby Management**:\n- 5-min timeout if idle\n- Banned players can't rejoin\n- Owner can't leave`,
      },
      {
        title: "🏆 Winning Conditions & End Scenarios",
        description: `**Victory**:\n- Last player with lives wins\n\n**Game End Scenarios**:\n- Natural elimination\n- Owner stops game\n- Technical or lobby closure`,
      },
      {
        title: "🔧 Technical Notes",
        description: `**Data Persistence**:\n- Lobbies saved across restarts\n- Stats & history maintained\n\n**Performance**:\n- Anti-spam auto-delete\n- Race condition protection\n- Auto-cleanup of expired lobbies`,
      },
    ];

    let currentPage = 0;

    const generateEmbed = (pageIndex) => {
      const page = pages[pageIndex];
      return new EmbedBuilder()
        .setTitle(page.title)
        .setDescription(page.description)
        .setColor(0x00ae86)
        .setFooter({ text: `Page ${pageIndex + 1} / ${pages.length}` });
    };

    const generateButtons = (pageIndex) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev_page")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === 0),
        new ButtonBuilder()
          .setCustomId("page_info")
          .setLabel(`${pageIndex + 1} / ${pages.length}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("next_page")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === pages.length - 1),
      );
    };

    const message = await interaction.reply({
      embeds: [generateEmbed(currentPage)],
      components: [generateButtons(currentPage)],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({ time: 600000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "❌ Only the command user can navigate these rules.",
          ephemeral: true,
        });
      }

      if (i.customId === "prev_page") {
        currentPage--;
      } else if (i.customId === "next_page") {
        currentPage++;
      }

      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons(currentPage)],
      });
    });
  },
};
