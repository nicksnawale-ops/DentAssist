sed -i 's/const conversations = Object.values(groupedLogs).map((group: any) => {/const conversations = (Object.values(groupedLogs) as any[]).map((group: any) => {/' src/pages/communications/CommunicationLog.tsx
sed -i 's/{filteredConversations.map(conv => (/{filteredConversations.map((conv: any) => (/' src/pages/communications/CommunicationLog.tsx
