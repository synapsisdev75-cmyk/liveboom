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

