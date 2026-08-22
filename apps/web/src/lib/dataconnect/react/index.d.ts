import { CreateMyProfileData, CreateMyProfileVariables, ListLiveStreamsData, ListGiftsData, MyWalletData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateMyProfile(options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;
export function useCreateMyProfile(dc: DataConnect, options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;

export function useListLiveStreams(options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;
export function useListLiveStreams(dc: DataConnect, options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;

export function useListGifts(options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;
export function useListGifts(dc: DataConnect, options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;

export function useMyWallet(options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;
export function useMyWallet(dc: DataConnect, options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;
