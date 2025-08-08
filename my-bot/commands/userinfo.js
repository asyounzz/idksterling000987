const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Displays information about a user, including their badges.')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to get information about')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Get the user from the interaction or fallback to the author
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    // Badge to Role Mapping
    const badgeMap = {
      'Discord Employee': 'Staff',
      'Discord Partner': 'Partner',
      'Discord Moderator': 'CertifiedModerator',
      'HypeSquad Events': 'HypeSquad',
      'Bravery': 'HypeSquadOnlineHouse1',
      'Brilliance': 'HypeSquadOnlineHouse2',
      'Balance': 'HypeSquadOnlineHouse3',
      'BugHunter Terminator': 'BugHunterLevel2',
      'BugHunter': 'BugHunterLevel1',
      'Early Supporter': 'PremiumEarlySupporter',
      'Active Developer': 'ActiveDeveloper',
      'Verified Developer': 'VerifiedDeveloper',
      'Bot': 'Bot',
      'Verified Bot': 'VerifiedBot',
    };

    // Get the badges of the user
    const userBadges = user.flags.toArray();
    const badgeNames = userBadges.map(badge => badgeMap[badge] || badge);

    // Create the embed with user info
    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}'s Information`)
      .setColor(Colors.Blurple)
      .setThumbnail(user.displayAvatarURL())  // Avatar in thumbnail
      .addFields(
        { name: 'Username', value: user.username, inline: true },
        { name: 'User ID', value: user.id, inline: true },
        { name: 'Account Created', value: user.createdAt.toDateString(), inline: true },
        { name: 'Join Date', value: member.joinedAt.toDateString(), inline: true },
        { name: 'Badges', value: badgeNames.length > 0 ? badgeNames.join(', ') : 'None', inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    // Send the embed as a reply
    await interaction.reply({ embeds: [embed] });
  },
};