export function formatGroupDisplayId(groupId: string): string {
    return groupId.replace(/^wss:\/\//, '');
}
