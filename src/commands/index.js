const { SlashCommandBuilder } = require('discord.js');

// Define all slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('update-progression')
        .setDescription('Manually trigger guild progression update')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('count-vods')
        .setDescription('Count VODs posted by a specific player')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Player name to search for')
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate a VOD performance')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('Message ID of the VOD to rate')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('Rating from 1 to 10')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10))
        .addStringOption(option =>
            option.setName('weapon')
                .setDescription('Weapon/Build used')
                .setRequired(true)
                .setMaxLength(50))
        .addStringOption(option =>
            option.setName('scale')
                .setDescription('Fight scale')
                .setRequired(true)
                .addChoices(
                    { name: 'Small (25 players)', value: 'Small (25)' },
                    { name: 'Medium (40 players)', value: 'Medium (40)' },
                    { name: 'Zerg (40+ players)', value: 'Zerg (40+)' }
                ))
        .addStringOption(option =>
            option.setName('comments')
                .setDescription('Additional comments (optional)')
                .setRequired(false)
                .setMaxLength(500))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Screenshot or image (optional)')
                .setRequired(false))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('rating-stats')
        .setDescription('Get rating statistics for a player or VOD')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Player name to get stats for (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('vod_message_id')
                .setDescription('Specific VOD message ID to analyze (optional)')
                .setRequired(false))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('player-rates')
        .setDescription('Get all ratings for a specific player with weapon and scale grouping')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Player name to search for')
                .setRequired(true))
        .toJSON(),
];

module.exports = { commands };
