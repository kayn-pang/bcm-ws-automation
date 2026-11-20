/**
 * Turn raw WhatsApp group metadata into the list the dashboard shows.
 *
 * A WhatsApp Community is a parent group you can't post into directly. Its posts
 * go to the community's "Announcements" group (only admins can post there), and it
 * can also contain sub-groups. Plain groups that aren't part of a community are "group".
 */
export function buildChatList(groups, myIds = []) {
  const mine = new Set(myIds.filter(Boolean).map(bareUser));
  const list = [];
  for (const g of groups) {
    const type = g.isCommunity ? 'community'
      : g.isCommunityAnnounce ? 'announcement'
        : g.linkedParent ? 'subgroup'
          : 'group';
    const me = (g.participants || []).find((p) => [p.id, p.lid, p.phoneNumber].some((id) => id && mine.has(bareUser(id))));
    const isAdmin = !!me?.admin;
    let canSend = true;
    let reason = null;
    if (type === 'community') {
      canSend = false;
      reason = 'Post to this community through its Announcements group.';
    } else if (g.announce && !isAdmin) {
      canSend = false;
      reason = 'Only admins can send messages here, and this number is not an admin.';
    }
    list.push({
      id: g.id,
      name: g.subject || '(no name)',
      type,
      parentId: g.isCommunity ? null : g.linkedParent || null,
      size: g.size ?? g.participants?.length ?? null,
      announce: !!g.announce,
      isAdmin,
      canSend,
      reason,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** "60123456789:12@s.whatsapp.net" -> "60123456789" */
function bareUser(jid) {
  return String(jid).split('@')[0].split(':')[0];
}
