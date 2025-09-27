const { generateLeaderboardEmbed } = require('../utils/leaderboard');
const { fuzzyWeaponMatch } = require('../utils/weaponMatching');

// Command handlers
class CommandHandlers {
    constructor(guildProgressionService) {
        this.guildProgressionService = guildProgressionService;
    }

    async handleUpdateProgression(interaction) {
        await interaction.deferReply({ flags: 64 }); // EPHEMERAL

        try {
            await this.guildProgressionService.updateGuildProgression();
            await interaction.editReply({
                content: '✅ Guild progression update completed successfully!'
            });
        } catch (error) {
            console.error('Error updating guild progression:', error);
            await interaction.editReply({
                content: `❌ Error updating guild progression: ${error.message}`
            });
        }
    }

    async handleCountVods(interaction) {
        await interaction.deferReply({ flags: 64 }); // EPHEMERAL

        try {
            const playerName = interaction.options.getString('player');
            const result = await this.guildProgressionService.countPlayerVODs(playerName);
            
            if (result.success) {
                const displayName = result.actualPlayerName !== playerName 
                    ? `${result.actualPlayerName} (matched from "${playerName}")` 
                    : playerName;
                await interaction.editReply({
                    content: `📹 **${displayName}** has posted **${result.vodCount}** VODs in their progression thread.`
                });
            } else {
                await interaction.editReply({
                    content: `❌ ${result.error}`
                });
            }
        } catch (error) {
            console.error('Error handling count-vods command:', error);
            await interaction.editReply({
                content: `❌ An unexpected error occurred: ${error.message}`
            });
        }
    }

    async handleRate(interaction) {
        try {
            // Check if command is used in a thread
            if (!interaction.channel.isThread()) {
                await interaction.reply({
                    content: '❌ This command can only be used inside player progression threads.',
                    flags: 64 // EPHEMERAL
                });
                return;
            }

            // Get all command options
            const messageId = interaction.options.getString('message_id');
            const rating = interaction.options.getInteger('rating');
            const weapon = interaction.options.getString('weapon');
            const scale = interaction.options.getString('scale');
            const comments = interaction.options.getString('comments') || '';
            const image = interaction.options.getAttachment('image');

            // Fetch the target message
            let targetMessage;
            try {
                targetMessage = await interaction.channel.messages.fetch(messageId);
            } catch (error) {
                await interaction.reply({
                    content: '❌ Could not find the specified message. Make sure the message ID is correct.',
                    flags: 64 // EPHEMERAL
                });
                return;
            }
            
            // Check if the message contains a VOD
            const vodPatterns = [
                /youtube\.com\/watch\?v=/i,
                /youtu\.be\//i,
                /medal\.tv\/clips\//i,
                /medal\.tv\/users\/.*\/clips\//i,
                /\.(mp4|mov|avi|mkv|webm)/i
            ];

            let isVod = false;
            let vodUrl = '';

            // Check message content
            if (targetMessage.content) {
                for (const pattern of vodPatterns) {
                    if (pattern.test(targetMessage.content)) {
                        isVod = true;
                        vodUrl = targetMessage.content;
                        break;
                    }
                }
            }

            // Check attachments
            if (!isVod && targetMessage.attachments) {
                for (const attachment of targetMessage.attachments.values()) {
                    if (attachment.contentType && attachment.contentType.startsWith('video/')) {
                        isVod = true;
                        vodUrl = attachment.url;
                        break;
                    }
                }
            }

            // Check embeds
            if (!isVod && targetMessage.embeds) {
                for (const embed of targetMessage.embeds) {
                    if (embed.url) {
                        for (const pattern of vodPatterns) {
                            if (pattern.test(embed.url)) {
                                isVod = true;
                                vodUrl = embed.url;
                                break;
                            }
                        }
                    }
                }
            }

            if (!isVod) {
                await interaction.reply({
                    content: '❌ The specified message does not contain a valid VOD (video, YouTube, or Medal link).',
                    flags: 64 // EPHEMERAL
                });
                return;
            }

            // Create rating embed with structured data for analytics
            const ratingEmbed = {
                color: rating >= 7 ? 0x00ff00 : rating >= 4 ? 0xffaa00 : 0xff0000,
                title: '🎯 VOD Performance Rating',
                description: `**Rating ID:** \`${Date.now()}-${interaction.user.id}\`\n**VOD Message:** [${messageId}](${targetMessage.url})`,
                fields: [
                    {
                        name: '⭐ Rating',
                        value: `${rating}/10`,
                        inline: true
                    },
                    {
                        name: '🗡️ Weapon/Build',
                        value: weapon,
                        inline: true
                    },
                    {
                        name: '⚔️ Fight Scale',
                        value: scale,
                        inline: true
                    },
                    {
                        name: '👤 Rated by',
                        value: interaction.user.toString(),
                        inline: true
                    },
                    {
                        name: '📊 Analytics Data',
                        value: `\`\`\`json\n{"rating":${rating},"weapon":"${weapon}","scale":"${scale}","rater_id":"${interaction.user.id}","rater_name":"${interaction.user.username}","vod_message_id":"${messageId}","timestamp":"${new Date().toISOString()}"}\`\`\``,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'VOD Rating System • Use /rating-stats to see analytics'
                }
            };

            // Add comments if provided
            if (comments.trim()) {
                ratingEmbed.fields.push({
                    name: '💬 Comments',
                    value: comments,
                    inline: false
                });
            }

            // Prepare reply content
            const replyContent = {
                content: `**VOD Rating Submitted!**`,
                embeds: [ratingEmbed]
            };

            // Add image if provided
            if (image) {
                // Validate image type
                if (image.contentType && image.contentType.startsWith('image/')) {
                    replyContent.files = [{
                        attachment: image.url,
                        name: image.name || 'rating_image.png'
                    }];
                } else {
                    await interaction.reply({
                        content: '❌ The provided attachment is not a valid image file.',
                        flags: 64 // EPHEMERAL
                    });
                    return;
                }
            }

            await interaction.reply(replyContent);

            console.log(`📊 VOD rating: ${rating}/10, Weapon: ${weapon}, Scale: ${scale} by ${interaction.user.tag}`);

        } catch (error) {
            console.error('Error handling rate command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: `❌ An unexpected error occurred: ${error.message}`,
                    flags: 64 // EPHEMERAL
                });
            }
        }
    }

    async handleRatingStats(interaction) {
        await interaction.deferReply({ flags: 64 }); // EPHEMERAL

        try {
            const playerName = interaction.options.getString('player');
            const vodMessageId = interaction.options.getString('vod_message_id');

            // Check if command is used in a thread
            if (!interaction.channel.isThread()) {
                await interaction.editReply({
                    content: '❌ This command can only be used inside player progression threads.'
                });
                return;
            }

            let targetMessageId = vodMessageId;
            let playerThread = null;

            // If player name is provided, find their thread
            if (playerName && !vodMessageId) {
                const existingThreads = await this.guildProgressionService.getExistingThreads(interaction.channel.parent);
                playerThread = this.guildProgressionService.findThreadByMemberName(existingThreads, playerName);
                
                if (!playerThread) {
                    await interaction.editReply({
                        content: `❌ No thread found for player "${playerName}".`
                    });
                    return;
                }
            }

            // Get all messages in the current thread
            const messages = [];
            let lastMessageId = null;

            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await interaction.channel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                messages.push(...fetchedMessages.values());
                lastMessageId = fetchedMessages.last().id;
            }

            // Filter rating messages
            const ratingMessages = messages.filter(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '🎯 VOD Performance Rating' &&
                msg.embeds[0].fields.some(field => field.name === '📊 Analytics Data')
            );

            // If specific VOD message ID is provided, filter by it
            if (vodMessageId) {
                const filteredRatings = ratingMessages.filter(msg => {
                    const analyticsField = msg.embeds[0].fields.find(field => field.name === '📊 Analytics Data');
                    if (analyticsField) {
                        try {
                            const data = JSON.parse(analyticsField.value.replace(/```json\n|\n```/g, ''));
                            return data.vod_message_id === vodMessageId;
                        } catch (e) {
                            return false;
                        }
                    }
                    return false;
                });
                ratingMessages.length = 0;
                ratingMessages.push(...filteredRatings);
            }

            if (ratingMessages.length === 0) {
                await interaction.editReply({
                    content: `❌ No ratings found${playerName ? ` for player "${playerName}"` : ''}${vodMessageId ? ` for VOD ${vodMessageId}` : ''}.`
                });
                return;
            }

            // Parse rating data
            const ratings = [];
            const weaponStats = {};
            const scaleStats = {};
            const raterStats = {};

            for (const msg of ratingMessages) {
                const analyticsField = msg.embeds[0].fields.find(field => field.name === '📊 Analytics Data');
                if (analyticsField) {
                    try {
                        // Clean the JSON string more thoroughly
                        let jsonString = analyticsField.value
                            .replace(/```json\n/g, '')
                            .replace(/\n```/g, '')
                            .replace(/```/g, '')
                            .trim();
                        
                        // Try to extract JSON from the string if it's embedded in other text
                        const jsonMatch = jsonString.match(/\{.*\}/s);
                        if (jsonMatch) {
                            jsonString = jsonMatch[0];
                        }
                        
                        const data = JSON.parse(jsonString);
                        ratings.push(data);
                        
                        // Count weapons
                        weaponStats[data.weapon] = (weaponStats[data.weapon] || 0) + 1;
                        
                        // Count scales
                        scaleStats[data.scale] = (scaleStats[data.scale] || 0) + 1;
                        
                        // Count raters
                        raterStats[data.rater_name] = (raterStats[data.rater_name] || 0) + 1;
                    } catch (e) {
                        console.error('Error parsing rating data:', e);
                        console.error('Problematic JSON string:', analyticsField.value);
                    }
                }
            }

            // Calculate statistics
            const totalRatings = ratings.length;
            const averageRating = (ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(2);
            const highestRating = Math.max(...ratings.map(r => r.rating));
            const lowestRating = Math.min(...ratings.map(r => r.rating));

            // Create stats embed
            const statsEmbed = {
                color: 0x0099ff,
                title: '📊 VOD Rating Statistics',
                description: `**Total Ratings:** ${totalRatings}\n**Average Rating:** ${averageRating}/10\n**Highest:** ${highestRating}/10 • **Lowest:** ${lowestRating}/10`,
                fields: [
                    {
                        name: '🗡️ Most Used Weapons',
                        value: Object.entries(weaponStats)
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, 5)
                            .map(([weapon, count]) => `${weapon}: ${count}`)
                            .join('\n') || 'No data',
                        inline: true
                    },
                    {
                        name: '⚔️ Fight Scales',
                        value: Object.entries(scaleStats)
                            .sort(([,a], [,b]) => b - a)
                            .map(([scale, count]) => `${scale}: ${count}`)
                            .join('\n') || 'No data',
                        inline: true
                    },
                    {
                        name: '👥 Most Active Raters',
                        value: Object.entries(raterStats)
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, 5)
                            .map(([rater, count]) => `${rater}: ${count}`)
                            .join('\n') || 'No data',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `VOD Rating Analytics${playerName ? ` • Player: ${playerName}` : ''}${vodMessageId ? ` • VOD: ${vodMessageId}` : ''}`
                }
            };

            await interaction.editReply({
                embeds: [statsEmbed]
            });

            console.log(`📊 Rating stats requested: ${totalRatings} ratings found by ${interaction.user.tag}`);

        } catch (error) {
            console.error('Error handling rating-stats command:', error);
            await interaction.editReply({
                content: `❌ An unexpected error occurred: ${error.message}`
            });
        }
    }

    async handlePlayerRates(interaction) {
        await interaction.deferReply({ flags: 64 }); // EPHEMERAL

        try {
            const playerName = interaction.options.getString('player');

            // Find the progression channel
            const progressionChannel = await this.guildProgressionService.findOrCreateProgressionChannel();
            
            // Find the player's thread using fuzzy search
            const existingThreads = await this.guildProgressionService.getExistingThreads(progressionChannel);
            const playerThread = this.guildProgressionService.findThreadByMemberName(existingThreads, playerName);
            
            if (!playerThread) {
                await interaction.editReply({
                    content: `❌ No thread found for player "${playerName}".`
                });
                return;
            }

            // Get the actual thread object
            const thread = progressionChannel.threads.cache.get(playerThread.id);
            if (!thread) {
                await interaction.editReply({
                    content: `❌ Thread found but could not access it. It might be archived.`
                });
                return;
            }

            // Get all messages in the player's thread
            const messages = [];
            let lastMessageId = null;

            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await thread.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                messages.push(...fetchedMessages.values());
                lastMessageId = fetchedMessages.last().id;
            }

            // Filter rating messages
            const ratingMessages = messages.filter(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '🎯 VOD Performance Rating' &&
                msg.embeds[0].fields.some(field => field.name === '📊 Analytics Data')
            );

            if (ratingMessages.length === 0) {
                await interaction.editReply({
                    content: `❌ No ratings found for player "${playerName}".`
                });
                return;
            }

            // Parse rating data
            const ratings = [];
            for (const msg of ratingMessages) {
                const analyticsField = msg.embeds[0].fields.find(field => field.name === '📊 Analytics Data');
                if (analyticsField) {
                    try {
                        // Clean the JSON string more thoroughly
                        let jsonString = analyticsField.value
                            .replace(/```json\n/g, '')
                            .replace(/\n```/g, '')
                            .replace(/```/g, '')
                            .trim();
                        
                        // Try to extract JSON from the string if it's embedded in other text
                        const jsonMatch = jsonString.match(/\{.*\}/s);
                        if (jsonMatch) {
                            jsonString = jsonMatch[0];
                        }
                        
                        const data = JSON.parse(jsonString);
                        ratings.push(data);
                    } catch (e) {
                        console.error('Error parsing rating data:', e);
                        console.error('Problematic JSON string:', analyticsField.value);
                    }
                }
            }

            // Group ratings by weapon and scale using fuzzy matching
            const groupedRatings = {};
            
            for (const rating of ratings) {
                let weaponGroup = null;
                let scaleGroup = rating.scale;
                
                // Find existing weapon group using fuzzy matching
                for (const existingWeapon of Object.keys(groupedRatings)) {
                    if (fuzzyWeaponMatch(rating.weapon, existingWeapon)) {
                        weaponGroup = existingWeapon;
                        break;
                    }
                }
                
                // If no match found, create new weapon group
                if (!weaponGroup) {
                    weaponGroup = rating.weapon;
                }
                
                // Initialize groups if they don't exist
                if (!groupedRatings[weaponGroup]) {
                    groupedRatings[weaponGroup] = {};
                }
                if (!groupedRatings[weaponGroup][scaleGroup]) {
                    groupedRatings[weaponGroup][scaleGroup] = [];
                }
                
                // Add rating to group
                groupedRatings[weaponGroup][scaleGroup].push(rating);
            }

            // Create detailed embed
            const embed = {
                color: 0x00ff00,
                title: `📊 Player Ratings: ${playerThread.name.split(' ')[0]}`,
                description: `**Total Ratings:** ${ratings.length}\n**Weapon Groups:** ${Object.keys(groupedRatings).length}`,
                fields: [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Player Rating Analysis'
                }
            };

            // Add weapon groups
            for (const [weapon, scales] of Object.entries(groupedRatings)) {
                let weaponText = `**${weapon}**\n`;
                let totalWeaponRatings = 0;
                let totalWeaponScore = 0;
                
                for (const [scale, scaleRatings] of Object.entries(scales)) {
                    const scaleAvg = (scaleRatings.reduce((sum, r) => sum + r.rating, 0) / scaleRatings.length).toFixed(1);
                    weaponText += `• ${scale}: ${scaleRatings.length} ratings (avg: ${scaleAvg}/10)\n`;
                    totalWeaponRatings += scaleRatings.length;
                    totalWeaponScore += scaleRatings.reduce((sum, r) => sum + r.rating, 0);
                }
                
                const overallAvg = (totalWeaponScore / totalWeaponRatings).toFixed(1);
                weaponText += `**Overall: ${totalWeaponRatings} ratings (avg: ${overallAvg}/10)**`;
                
                embed.fields.push({
                    name: `🗡️ ${weapon}`,
                    value: weaponText,
                    inline: false
                });
            }

            // Add summary statistics
            const overallAvg = (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(2);
            const highestRating = Math.max(...ratings.map(r => r.rating));
            const lowestRating = Math.min(...ratings.map(r => r.rating));
            
            embed.fields.push({
                name: '📈 Summary',
                value: `**Overall Average:** ${overallAvg}/10\n**Highest Rating:** ${highestRating}/10\n**Lowest Rating:** ${lowestRating}/10`,
                inline: false
            });

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(`📊 Player rates requested: ${ratings.length} ratings found for ${playerName} by ${interaction.user.tag}`);

        } catch (error) {
            console.error('Error handling player-rates command:', error);
            await interaction.editReply({
                content: `❌ An unexpected error occurred: ${error.message}`
            });
        }
    }

}

module.exports = { CommandHandlers };
