const { ChannelType } = require('discord.js');

class GuildProgressionService {
    constructor(client) {
        this.client = client;
        this.guildId = process.env.GUILD_ID;
        this.albionGuildId = process.env.ALBION_GUILD_ID;
        this.maxThreads = 50; // Discord's limit for threads per channel
    }

    /**
     * Format large numbers with K, M, B suffixes
     * @param {number} num - The number to format
     * @returns {string} - Formatted number string
     */
    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(0) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(0) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'k';
        }
        return num.toString();
    }

    /**
     * Create thread title for a guild member
     * @param {Object} member - Guild member data from API
     * @returns {string} - Formatted thread title
     */
    createThreadTitle(member, vodCount = 0) {
        const name = member.Name;
        const fameRatio = member.FameRatio.toFixed(1);
        const pveFame = this.formatNumber(member.LifetimeStatistics.PvE.Total);
        return `${name} ⚔️${fameRatio} 💎${pveFame} 📹${vodCount}`;
    }

    /**
     * Fetch guild members from Albion Online API
     * @returns {Promise<Array>} - Array of guild members
     */
    async fetchGuildMembers() {
        try {
            const response = await fetch(`https://gameinfo.albiononline.com/api/gameinfo/guilds/${this.albionGuildId}/members`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching guild members:', error);
            throw error;
        }
    }

    /**
     * Find or create the "Guild Progression" forum channel
     * @returns {Promise<Object>} - Discord forum channel object
     */
    async findOrCreateProgressionChannel() {
        const guild = this.client.guilds.cache.get(this.guildId);
        if (!guild) {
            throw new Error('Guild not found');
        }

        // Look for existing forum channel
        let channel = guild.channels.cache.find(
            ch => ch.name === 'guild-progression' && ch.type === ChannelType.GuildForum
        );

        if (!channel) {
            // Create new forum channel
            channel = await guild.channels.create({
                name: 'guild-progression',
                type: ChannelType.GuildForum,
                topic: 'Guild member progression tracking - Auto-generated threads for each member'
            });
            console.log(`✅ Created Guild Progression forum: ${channel.name}`);
        }

        return channel;
    }

    /**
     * Get all existing threads in the channel
     * @param {Object} channel - Discord channel object
     * @returns {Promise<Array>} - Array of thread objects
     */
    async getExistingThreads(channel) {
        const threads = [];
        
        // Fetch all threads from the API, not just cached ones
        const threadChannels = await channel.threads.fetchActive();
        
        for (const thread of threadChannels.threads.values()) {
            threads.push({
                id: thread.id,
                name: thread.name,
                archived: thread.archived
            });
        }

        // Also fetch archived threads
        const archivedThreads = await channel.threads.fetchArchived();
        for (const thread of archivedThreads.threads.values()) {
            threads.push({
                id: thread.id,
                name: thread.name,
                archived: thread.archived
            });
        }

        return threads;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Distance between strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;

        for (let i = 0; i <= len2; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len1; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len2; i++) {
            for (let j = 1; j <= len1; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[len2][len1];
    }

    /**
     * Calculate similarity ratio between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity ratio (0-1)
     */
    calculateSimilarity(str1, str2) {
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1;
        
        const distance = this.levenshteinDistance(str1, str2);
        return (maxLength - distance) / maxLength;
    }

    /**
     * Find thread by member name with fuzzy search
     * @param {Array} threads - Array of existing threads
     * @param {string} memberName - Member name to search for
     * @param {number} threshold - Similarity threshold (0-1, default 0.6)
     * @returns {Object|null} - Thread object or null if not found
     */
    findThreadByMemberName(threads, memberName, threshold = 0.6) {
        const searchName = memberName.toLowerCase();
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const thread of threads) {
            const threadName = thread.name.toLowerCase();
            
            // Extract player name from thread title (remove icons and stats)
            const playerName = threadName.split(' ')[0]; // Get first word (player name)
            
            // Check exact match first
            if (playerName === searchName || threadName.startsWith(searchName)) {
                return thread;
            }
            
            // Check if search name is contained in player name
            if (playerName.includes(searchName) || searchName.includes(playerName)) {
                return thread;
            }
            
            // Calculate similarity
            const similarity = this.calculateSimilarity(playerName, searchName);
            
            if (similarity > bestSimilarity && similarity >= threshold) {
                bestSimilarity = similarity;
                bestMatch = thread;
            }
        }

        return bestMatch;
    }

    /**
     * Create or update thread for a guild member
     * @param {Object} channel - Discord forum channel object
     * @param {Object} member - Guild member data
     * @param {Array} existingThreads - Array of existing threads
     * @returns {Promise<Object>} - Thread object
     */
    async createOrUpdateThread(channel, member, existingThreads, skipVodCount = false) {
        try {
            console.log(`🔍 Processing member: ${member.Name}`);
            
            const existingThread = this.findThreadByMemberName(existingThreads, member.Name);
            let vodCount = 0;

            if (existingThread) {
                console.log(`📋 Found existing thread for ${member.Name}: ${existingThread.name}`);
                
                // For existing threads, preserve existing VOD count or count if needed
                const thread = channel.threads.cache.get(existingThread.id);
                if (thread) {
                    console.log(`🔗 Thread object found for ${member.Name}`);
                    
                    if (skipVodCount) {
                        // Extract existing VOD count from thread title to avoid expensive counting
                        const titleParts = thread.name.split(' ');
                        const vodPart = titleParts.find(part => part.startsWith('📹'));
                        if (vodPart) {
                            vodCount = parseInt(vodPart.replace('📹', '')) || 0;
                        }
                        console.log(`📊 Extracted VOD count for ${member.Name}: ${vodCount}`);
                    } else {
                        // Count VODs (expensive operation)
                        vodCount = await this.countVodsInThread(thread);
                    }
                } else {
                    console.log(`⚠️ Thread object not found in cache for ${member.Name}`);
                }
            } else {
                // For new threads, start with 0 VODs
                vodCount = 0;
                console.log(`🆕 New thread needed for ${member.Name}`);
            }
            
            const threadTitle = this.createThreadTitle(member, vodCount);
            console.log(`📝 Generated title for ${member.Name}: ${threadTitle}`);

            if (existingThread) {
                // Update existing thread title
                const thread = channel.threads.cache.get(existingThread.id);
                if (thread && thread.name !== threadTitle) {
                    console.log(`🔄 Updating thread title for ${member.Name}...`);
                    try {
                        // Add timeout to prevent hanging
                        await Promise.race([
                            thread.setName(threadTitle),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('setName timeout after 10 seconds')), 10000)
                            )
                        ]);
                        console.log(`📝 Updated thread for ${member.Name}: ${threadTitle}`);
                    } catch (error) {
                        console.error(`❌ Failed to update thread title for ${member.Name}:`, error.message);
                        // Continue processing other members instead of stopping
                    }
                } else {
                    console.log(`✅ Thread title unchanged for ${member.Name}`);
                }
                return thread;
            } else {
                // Create new forum thread (topic)
                console.log(`🆕 Creating new thread for ${member.Name}...`);
                try {
                    const thread = await Promise.race([
                        channel.threads.create({
                            name: threadTitle,
                            message: {
                                content: `**${member.Name}** - Guild Progression Tracking\n\nThis thread tracks the progression of ${member.Name} in the guild.`
                            },
                            autoArchiveDuration: 10080, // 7 days
                        }),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('thread creation timeout after 15 seconds')), 15000)
                        )
                    ]);
                    console.log(`🆕 Created new forum thread for ${member.Name}: ${threadTitle}`);
                    return thread;
                } catch (error) {
                    console.error(`❌ Failed to create thread for ${member.Name}:`, error.message);
                    // Return null to continue processing other members
                    return null;
                }
            }
        } catch (error) {
            console.error(`❌ Error processing member ${member.Name}:`, error);
            throw error;
        }
    }

    /**
     * Update thread title with current VOD count
     * @param {Object} thread - Discord thread object
     * @param {string} playerName - Player name
     * @returns {Promise<void>}
     */
    async updateThreadVodCount(thread, playerName) {
        try {
            // Count VODs directly in this thread
            const vodCount = await this.countVodsInThread(thread);
            
            // Extract current thread title parts
            const currentTitle = thread.name;
            const parts = currentTitle.split(' ');
            
            // Check if VOD count already exists in title
            let hasVodCount = false;
            let newTitle = '';
            
            for (let i = 0; i < parts.length; i++) {
                if (parts[i].startsWith('📹')) {
                    // Update existing VOD count
                    newTitle += `📹${vodCount}`;
                    hasVodCount = true;
                } else {
                    newTitle += parts[i];
                }
                if (i < parts.length - 1) {
                    newTitle += ' ';
                }
            }
            
            // If no VOD count found, append it to the end
            if (!hasVodCount) {
                newTitle += ` 📹${vodCount}`;
            }
            
            // Update thread title if it changed
            if (newTitle !== currentTitle) {
                await thread.setName(newTitle);
                console.log(`📹 Updated VOD count for ${playerName}: ${newTitle}`);
            } else {
                console.log(`📹 VOD count unchanged for ${playerName}: ${vodCount}`);
            }
        } catch (error) {
            console.error(`Error updating VOD count for ${playerName}:`, error);
        }
    }

    /**
     * Count VODs directly in a specific thread
     * @param {Object} thread - Discord thread object
     * @returns {Promise<number>} - Number of VODs found
     */
    async countVodsInThread(thread) {
        try {
            console.log(`🔍 Counting VODs in thread: ${thread.name}`);
            let vodCount = 0;
            let lastMessageId = null;
            let totalMessages = 0;
            const vodPatterns = [
                /youtube\.com\/watch\?v=/i,
                /youtu\.be\//i,
                /medal\.tv\/clips\//i,
                /medal\.tv\/users\/.*\/clips\//i,
                /discord\.com\/channels\/.*\/.*\/.*\.(mp4|mov|avi|mkv|webm)/i,
                /\.(mp4|mov|avi|mkv|webm)/i
            ];

            // Fetch messages in batches
            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const messages = await thread.messages.fetch(options);
                
                if (messages.size === 0) break;

                totalMessages += messages.size;
                console.log(`📊 Processing batch of ${messages.size} messages (total so far: ${totalMessages})`);

                // Count VODs in this batch
                for (const message of messages.values()) {
                    let messageHasVod = false;
                    
                    // Check message content for VOD links
                    if (message.content) {
                        for (const pattern of vodPatterns) {
                            if (pattern.test(message.content)) {
                                vodCount++;
                                messageHasVod = true;
                                console.log(`📹 Found VOD in content: ${message.content.substring(0, 100)}...`);
                                break; // Count each message only once
                            }
                        }
                    }

                    // Check attachments for video files
                    if (!messageHasVod && message.attachments) {
                        for (const attachment of message.attachments.values()) {
                            if (attachment.contentType && attachment.contentType.startsWith('video/')) {
                                vodCount++;
                                messageHasVod = true;
                                console.log(`📹 Found VOD attachment: ${attachment.name}`);
                                break; // Count each message only once
                            }
                        }
                    }

                    // Check embeds for video content
                    if (!messageHasVod && message.embeds) {
                        for (const embed of message.embeds) {
                            if (embed.url) {
                                for (const pattern of vodPatterns) {
                                    if (pattern.test(embed.url)) {
                                        vodCount++;
                                        messageHasVod = true;
                                        console.log(`📹 Found VOD in embed: ${embed.url}`);
                                        break; // Count each message only once
                                    }
                                }
                            }
                        }
                    }
                }

                lastMessageId = messages.last().id;
            }

            console.log(`📊 Total messages processed: ${totalMessages}, VODs found: ${vodCount}`);
            return vodCount;
        } catch (error) {
            console.error('Error counting VODs in thread:', error);
            return 0;
        }
    }

    /**
     * Archive threads for members no longer in guild
     * @param {Object} channel - Discord channel object
     * @param {Array} existingThreads - Array of existing threads
     * @param {Array} currentMembers - Array of current guild members
     */
    async archiveOldThreads(channel, existingThreads, currentMembers) {
        const currentMemberNames = currentMembers.map(member => member.Name.toLowerCase());
        
        for (const thread of existingThreads) {
            const threadName = thread.name.toLowerCase();
            const isArchived = threadName.includes('(archive)');
            
            // Check if this thread belongs to a current member
            const belongsToCurrentMember = currentMemberNames.some(name => 
                threadName.startsWith(name) || threadName.includes(` ${name} `)
            );

            if (!belongsToCurrentMember && !isArchived) {
                const discordThread = channel.threads.cache.get(thread.id);
                if (discordThread) {
                    await discordThread.setName(`(Archive) ${thread.name}`);
                    console.log(`📦 Archived thread: ${thread.name}`);
                }
            }
        }
    }

    /**
     * Clean up archived threads if we're at the limit
     * @param {Object} channel - Discord channel object
     */
    async cleanupArchivedThreads(channel) {
        const threads = Array.from(channel.threads.cache.values());
        
        if (threads.length >= this.maxThreads) {
            // Find archived threads
            const archivedThreads = threads.filter(thread => 
                thread.name.toLowerCase().includes('(archive)')
            );

            // Delete oldest archived threads to make space
            const threadsToDelete = archivedThreads
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .slice(0, Math.min(5, archivedThreads.length)); // Delete up to 5 threads

            for (const thread of threadsToDelete) {
                await thread.delete();
                console.log(`🗑️ Deleted archived thread: ${thread.name}`);
            }
        }
    }

    /**
     * Count VODs posted by a specific player in their thread
     * @param {string} playerName - Name of the player to search for
     * @returns {Promise<Object>} - Result object with VOD count
     */
    async countPlayerVODs(playerName) {
        try {
            console.log(`🔍 Searching for VODs by player: ${playerName}`);

            // Find or create progression channel
            const channel = await this.findOrCreateProgressionChannel();

            // Get all existing threads
            const existingThreads = await this.getExistingThreads(channel);
            console.log(`🧵 Found ${existingThreads.length} existing threads`);

            // Find thread for the player using fuzzy search
            const playerThread = this.findThreadByMemberName(existingThreads, playerName);

            if (!playerThread) {
                return {
                    success: false,
                    error: `No thread found for player "${playerName}". Make sure the player exists in the guild.`
                };
            }

            // Extract the actual player name from the thread title
            const actualPlayerName = playerThread.name.split(' ')[0];

            // Get the actual thread object
            const thread = channel.threads.cache.get(playerThread.id);
            if (!thread) {
                return {
                    success: false,
                    error: `Thread found but could not access it. It might be archived.`
                };
            }

            // Fetch all messages in the thread
            let vodCount = 0;
            let lastMessageId = null;
            const vodPatterns = [
                /youtube\.com\/watch\?v=/i,
                /youtu\.be\//i,
                /medal\.tv\/clips\//i,
                /medal\.tv\/users\/.*\/clips\//i,
                /discord\.com\/channels\/.*\/.*\/.*\.(mp4|mov|avi|mkv|webm)/i,
                /\.(mp4|mov|avi|mkv|webm)/i
            ];

            // Fetch messages in batches
            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const messages = await thread.messages.fetch(options);
                
                if (messages.size === 0) break;

                // Count VODs in this batch
                for (const message of messages.values()) {
                    // Check message content for VOD links
                    if (message.content) {
                        for (const pattern of vodPatterns) {
                            if (pattern.test(message.content)) {
                                vodCount++;
                                break; // Count each message only once
                            }
                        }
                    }

                    // Check attachments for video files
                    if (message.attachments) {
                        for (const attachment of message.attachments.values()) {
                            if (attachment.contentType && attachment.contentType.startsWith('video/')) {
                                vodCount++;
                                break; // Count each message only once
                            }
                        }
                    }

                    // Check embeds for video content
                    if (message.embeds) {
                        for (const embed of message.embeds) {
                            if (embed.url) {
                                for (const pattern of vodPatterns) {
                                    if (pattern.test(embed.url)) {
                                        vodCount++;
                                        break; // Count each message only once
                                    }
                                }
                            }
                        }
                    }
                }

                lastMessageId = messages.last().id;
            }

            console.log(`📹 Found ${vodCount} VODs for player ${actualPlayerName}`);
            return {
                success: true,
                vodCount: vodCount,
                actualPlayerName: actualPlayerName
            };

        } catch (error) {
            console.error('Error counting VODs:', error);
            return {
                success: false,
                error: `Error counting VODs: ${error.message}`
            };
        }
    }

    /**
     * Main function to update guild progression
     */
    async updateGuildProgression() {
        try {
            console.log('🔄 Starting guild progression update...');
            const startTime = Date.now();

            // Fetch current guild members
            console.log('⏱️ Fetching guild members from API...');
            const guildMembers = await this.fetchGuildMembers();
            console.log(`📊 Found ${guildMembers.length} guild members (${Date.now() - startTime}ms)`);

            // Find or create progression channel
            console.log('⏱️ Finding/creating progression channel...');
            const channel = await this.findOrCreateProgressionChannel();
            console.log(`📁 Channel ready (${Date.now() - startTime}ms)`);

            // Get existing threads
            console.log('⏱️ Fetching existing threads...');
            const existingThreads = await this.getExistingThreads(channel);
            console.log(`🧵 Found ${existingThreads.length} existing threads (${Date.now() - startTime}ms)`);

            // Create or update threads for current members (skip VOD counting for speed)
            console.log('⏱️ Starting thread updates...');
            const updateStartTime = Date.now();
            let processedCount = 0;
            
            for (const member of guildMembers) {
                await this.createOrUpdateThread(channel, member, existingThreads, true);
                processedCount++;
                
                // Log progress every 10 members
                if (processedCount % 10 === 0) {
                    console.log(`📝 Processed ${processedCount}/${guildMembers.length} members (${Date.now() - updateStartTime}ms)`);
                }
            }
            
            console.log(`📝 Completed thread updates for ${processedCount} members (${Date.now() - updateStartTime}ms)`);

            // Archive threads for members no longer in guild
            await this.archiveOldThreads(channel, existingThreads, guildMembers);

            console.log(`✅ Guild progression update completed successfully (${Date.now() - startTime}ms total)`);
            return { success: true, membersProcessed: guildMembers.length };

        } catch (error) {
            console.error('❌ Error updating guild progression:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = GuildProgressionService;
