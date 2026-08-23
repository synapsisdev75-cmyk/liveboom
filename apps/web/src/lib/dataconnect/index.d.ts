import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateMyProfileData {
  user_insert: User_Key;
}

export interface CreateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface CreateMyTransactionData {
  query?: {
    user?: {
      id: UUIDString;
    } & User_Key;
  };
  transaction_insert: Transaction_Key;
}

export interface CreateMyTransactionVariables {
  amount: number;
  transactionType: string;
  status: string;
  referenceId?: UUIDString | null;
}

export interface EndMyStreamData {
  stream_update?: Stream_Key | null;
}

export interface EndMyStreamVariables {
  streamId: UUIDString;
}

export interface GetUserByUsernameData {
  users: ({
    id: UUIDString;
    firebaseUid: string;
    username: string;
    email: string;
    avatarUrl?: string | null;
    bio?: string | null;
    coinsBalance: number;
    createdAt: TimestampString;
  } & User_Key)[];
}

export interface GetUserByUsernameVariables {
  username: string;
}

export interface Gift_Key {
  id: UUIDString;
  __typename?: 'Gift_Key';
}

export interface ListGiftsData {
  gifts: ({
    id: UUIDString;
    name: string;
    imageUrl: string;
    coinPrice: number;
  } & Gift_Key)[];
}

export interface ListLiveStreamsData {
  streams: ({
    id: UUIDString;
    title: string;
    status: string;
    isPrivate: boolean;
    lockPrice?: number | null;
    startedAt: TimestampString;
    creator: {
      id: UUIDString;
      username: string;
      avatarUrl?: string | null;
      coinsBalance: number;
    } & User_Key;
  } & Stream_Key)[];
}

export interface MyTransactionsData {
  transactions: ({
    id: UUIDString;
    amount: number;
    transactionType: string;
    status: string;
    createdAt: TimestampString;
    referenceId?: UUIDString | null;
  } & Transaction_Key)[];
}

export interface MyWalletData {
  users: ({
    id: UUIDString;
    username: string;
    email: string;
    avatarUrl?: string | null;
    bio?: string | null;
    coinsBalance: number;
  } & User_Key)[];
}

export interface SearchUsersData {
  users: ({
    id: UUIDString;
    username: string;
    avatarUrl?: string | null;
    bio?: string | null;
    coinsBalance: number;
  } & User_Key)[];
}

export interface SearchUsersVariables {
  needle: string;
}

export interface SendStreamGiftData {
  query?: {
    sender?: {
      id: UUIDString;
    } & User_Key;
  };
  streamGift_insert: StreamGift_Key;
}

export interface SendStreamGiftVariables {
  streamId: UUIDString;
  receiverId: UUIDString;
  giftId: UUIDString;
  quantity: number;
}

export interface StartMyStreamData {
  query?: {
    user?: {
      id: UUIDString;
      username: string;
    } & User_Key;
  };
  stream_insert: Stream_Key;
}

export interface StartMyStreamVariables {
  title: string;
  isPrivate: boolean;
  lockPrice?: number | null;
}

export interface StreamGift_Key {
  id: UUIDString;
  __typename?: 'StreamGift_Key';
}

export interface Stream_Key {
  id: UUIDString;
  __typename?: 'Stream_Key';
}

export interface Transaction_Key {
  id: UUIDString;
  __typename?: 'Transaction_Key';
}

export interface UpdateMyProfileData {
  user_updateMany: number;
}

export interface UpdateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateMyProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateMyProfileVariables): MutationRef<CreateMyProfileData, CreateMyProfileVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateMyProfileVariables): MutationRef<CreateMyProfileData, CreateMyProfileVariables>;
  operationName: string;
}
export const createMyProfileRef: CreateMyProfileRef;

export function createMyProfile(vars: CreateMyProfileVariables): MutationPromise<CreateMyProfileData, CreateMyProfileVariables>;
export function createMyProfile(dc: DataConnect, vars: CreateMyProfileVariables): MutationPromise<CreateMyProfileData, CreateMyProfileVariables>;

interface UpdateMyProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateMyProfileVariables): MutationRef<UpdateMyProfileData, UpdateMyProfileVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateMyProfileVariables): MutationRef<UpdateMyProfileData, UpdateMyProfileVariables>;
  operationName: string;
}
export const updateMyProfileRef: UpdateMyProfileRef;

export function updateMyProfile(vars: UpdateMyProfileVariables): MutationPromise<UpdateMyProfileData, UpdateMyProfileVariables>;
export function updateMyProfile(dc: DataConnect, vars: UpdateMyProfileVariables): MutationPromise<UpdateMyProfileData, UpdateMyProfileVariables>;

interface StartMyStreamRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: StartMyStreamVariables): MutationRef<StartMyStreamData, StartMyStreamVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: StartMyStreamVariables): MutationRef<StartMyStreamData, StartMyStreamVariables>;
  operationName: string;
}
export const startMyStreamRef: StartMyStreamRef;

export function startMyStream(vars: StartMyStreamVariables): MutationPromise<StartMyStreamData, StartMyStreamVariables>;
export function startMyStream(dc: DataConnect, vars: StartMyStreamVariables): MutationPromise<StartMyStreamData, StartMyStreamVariables>;

interface EndMyStreamRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: EndMyStreamVariables): MutationRef<EndMyStreamData, EndMyStreamVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: EndMyStreamVariables): MutationRef<EndMyStreamData, EndMyStreamVariables>;
  operationName: string;
}
export const endMyStreamRef: EndMyStreamRef;

export function endMyStream(vars: EndMyStreamVariables): MutationPromise<EndMyStreamData, EndMyStreamVariables>;
export function endMyStream(dc: DataConnect, vars: EndMyStreamVariables): MutationPromise<EndMyStreamData, EndMyStreamVariables>;

interface CreateMyTransactionRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateMyTransactionVariables): MutationRef<CreateMyTransactionData, CreateMyTransactionVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateMyTransactionVariables): MutationRef<CreateMyTransactionData, CreateMyTransactionVariables>;
  operationName: string;
}
export const createMyTransactionRef: CreateMyTransactionRef;

export function createMyTransaction(vars: CreateMyTransactionVariables): MutationPromise<CreateMyTransactionData, CreateMyTransactionVariables>;
export function createMyTransaction(dc: DataConnect, vars: CreateMyTransactionVariables): MutationPromise<CreateMyTransactionData, CreateMyTransactionVariables>;

interface SendStreamGiftRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SendStreamGiftVariables): MutationRef<SendStreamGiftData, SendStreamGiftVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SendStreamGiftVariables): MutationRef<SendStreamGiftData, SendStreamGiftVariables>;
  operationName: string;
}
export const sendStreamGiftRef: SendStreamGiftRef;

export function sendStreamGift(vars: SendStreamGiftVariables): MutationPromise<SendStreamGiftData, SendStreamGiftVariables>;
export function sendStreamGift(dc: DataConnect, vars: SendStreamGiftVariables): MutationPromise<SendStreamGiftData, SendStreamGiftVariables>;

interface ListLiveStreamsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListLiveStreamsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListLiveStreamsData, undefined>;
  operationName: string;
}
export const listLiveStreamsRef: ListLiveStreamsRef;

export function listLiveStreams(options?: ExecuteQueryOptions): QueryPromise<ListLiveStreamsData, undefined>;
export function listLiveStreams(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListLiveStreamsData, undefined>;

interface ListGiftsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListGiftsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListGiftsData, undefined>;
  operationName: string;
}
export const listGiftsRef: ListGiftsRef;

export function listGifts(options?: ExecuteQueryOptions): QueryPromise<ListGiftsData, undefined>;
export function listGifts(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListGiftsData, undefined>;

interface MyWalletRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyWalletData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyWalletData, undefined>;
  operationName: string;
}
export const myWalletRef: MyWalletRef;

export function myWallet(options?: ExecuteQueryOptions): QueryPromise<MyWalletData, undefined>;
export function myWallet(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyWalletData, undefined>;

interface GetUserByUsernameRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByUsernameVariables): QueryRef<GetUserByUsernameData, GetUserByUsernameVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUserByUsernameVariables): QueryRef<GetUserByUsernameData, GetUserByUsernameVariables>;
  operationName: string;
}
export const getUserByUsernameRef: GetUserByUsernameRef;

export function getUserByUsername(vars: GetUserByUsernameVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUsernameData, GetUserByUsernameVariables>;
export function getUserByUsername(dc: DataConnect, vars: GetUserByUsernameVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUsernameData, GetUserByUsernameVariables>;

interface SearchUsersRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchUsersVariables): QueryRef<SearchUsersData, SearchUsersVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SearchUsersVariables): QueryRef<SearchUsersData, SearchUsersVariables>;
  operationName: string;
}
export const searchUsersRef: SearchUsersRef;

export function searchUsers(vars: SearchUsersVariables, options?: ExecuteQueryOptions): QueryPromise<SearchUsersData, SearchUsersVariables>;
export function searchUsers(dc: DataConnect, vars: SearchUsersVariables, options?: ExecuteQueryOptions): QueryPromise<SearchUsersData, SearchUsersVariables>;

interface MyTransactionsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyTransactionsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyTransactionsData, undefined>;
  operationName: string;
}
export const myTransactionsRef: MyTransactionsRef;

export function myTransactions(options?: ExecuteQueryOptions): QueryPromise<MyTransactionsData, undefined>;
export function myTransactions(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyTransactionsData, undefined>;

