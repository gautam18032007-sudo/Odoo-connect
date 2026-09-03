// Confirmed unused repo-wide (no imports of this module found anywhere in
// src/) — previously held stale profile data (names, real personal emails)
// for the retired "diwakarpro01" account and another developer account.
// Left as an empty, harmless export rather than deleted outright, in case
// something outside this audit's visibility still expects the module to
// exist; populate from real, current account data if this is ever wired
// up to an actual consumer.
export const users: Array<{
	id: string;
	name: string;
	username: string;
	email: string;
	avatar: string;
	role: string;
}> = [];

export const rootUser = users[0];
