/** No credentials and no requests: all provider activity terminates here. */
const result = { data: [], error: null, count: 0 };
const query: object = new Proxy({}, { get: (_target, key) => key === 'then'
  ? (resolve: (value: typeof result) => void) => resolve(result)
  : () => query });
const channel = { on: () => channel, subscribe: () => channel, unsubscribe: async () => {}, track: async () => {}, untrack: async () => {}, presenceState: () => ({}) };
const client = {
  from: () => query, rpc: async () => result,
  channel: () => channel, removeChannel: async () => {}, removeAllChannels: async () => {},
  auth: { getUser: async () => ({ data: { user: null }, error: null }), getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
};
export const createClient = () => client;
