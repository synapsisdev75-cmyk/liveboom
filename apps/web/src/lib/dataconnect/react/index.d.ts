import { CreateMyProfileData, CreateMyProfileVariables, UpdateMyProfileData, UpdateMyProfileVariables, StartMyStreamData, StartMyStreamVariables, EndMyStreamData, EndMyStreamVariables, CreateMyTransactionData, CreateMyTransactionVariables, SendStreamGiftData, SendStreamGiftVariables, ListLiveStreamsData, ListGiftsData, MyWalletData, GetUserByUsernameData, GetUserByUsernameVariables, SearchUsersData, SearchUsersVariables, MyTransactionsData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateMyProfile(options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;
export function useCreateMyProfile(dc: DataConnect, options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;

export function useUpdateMyProfile(options?: useDataConnectMutationOptions<UpdateMyProfileData, FirebaseError, UpdateMyProfileVariables>): UseDataConnectMutationResult<UpdateMyProfileData, UpdateMyProfileVariables>;
export function useUpdateMyProfile(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateMyProfileData, FirebaseError, UpdateMyProfileVariables>): UseDataConnectMutationResult<UpdateMyProfileData, UpdateMyProfileVariables>;

export function useStartMyStream(options?: useDataConnectMutationOptions<StartMyStreamData, FirebaseError, StartMyStreamVariables>): UseDataConnectMutationResult<StartMyStreamData, StartMyStreamVariables>;
export function useStartMyStream(dc: DataConnect, options?: useDataConnectMutationOptions<StartMyStreamData, FirebaseError, StartMyStreamVariables>): UseDataConnectMutationResult<StartMyStreamData, StartMyStreamVariables>;

export function useEndMyStream(options?: useDataConnectMutationOptions<EndMyStreamData, FirebaseError, EndMyStreamVariables>): UseDataConnectMutationResult<EndMyStreamData, EndMyStreamVariables>;
export function useEndMyStream(dc: DataConnect, options?: useDataConnectMutationOptions<EndMyStreamData, FirebaseError, EndMyStreamVariables>): UseDataConnectMutationResult<EndMyStreamData, EndMyStreamVariables>;

export function useCreateMyTransaction(options?: useDataConnectMutationOptions<CreateMyTransactionData, FirebaseError, CreateMyTransactionVariables>): UseDataConnectMutationResult<CreateMyTransactionData, CreateMyTransactionVariables>;
export function useCreateMyTransaction(dc: DataConnect, options?: useDataConnectMutationOptions<CreateMyTransactionData, FirebaseError, CreateMyTransactionVariables>): UseDataConnectMutationResult<CreateMyTransactionData, CreateMyTransactionVariables>;

export function useSendStreamGift(options?: useDataConnectMutationOptions<SendStreamGiftData, FirebaseError, SendStreamGiftVariables>): UseDataConnectMutationResult<SendStreamGiftData, SendStreamGiftVariables>;
export function useSendStreamGift(dc: DataConnect, options?: useDataConnectMutationOptions<SendStreamGiftData, FirebaseError, SendStreamGiftVariables>): UseDataConnectMutationResult<SendStreamGiftData, SendStreamGiftVariables>;

export function useListLiveStreams(options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;
export function useListLiveStreams(dc: DataConnect, options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;

export function useListGifts(options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;
export function useListGifts(dc: DataConnect, options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;

export function useMyWallet(options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;
export function useMyWallet(dc: DataConnect, options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;

export function useGetUserByUsername(vars: GetUserByUsernameVariables, options?: useDataConnectQueryOptions<GetUserByUsernameData>): UseDataConnectQueryResult<GetUserByUsernameData, GetUserByUsernameVariables>;
export function useGetUserByUsername(dc: DataConnect, vars: GetUserByUsernameVariables, options?: useDataConnectQueryOptions<GetUserByUsernameData>): UseDataConnectQueryResult<GetUserByUsernameData, GetUserByUsernameVariables>;

export function useSearchUsers(vars: SearchUsersVariables, options?: useDataConnectQueryOptions<SearchUsersData>): UseDataConnectQueryResult<SearchUsersData, SearchUsersVariables>;
export function useSearchUsers(dc: DataConnect, vars: SearchUsersVariables, options?: useDataConnectQueryOptions<SearchUsersData>): UseDataConnectQueryResult<SearchUsersData, SearchUsersVariables>;

export function useMyTransactions(options?: useDataConnectQueryOptions<MyTransactionsData>): UseDataConnectQueryResult<MyTransactionsData, undefined>;
export function useMyTransactions(dc: DataConnect, options?: useDataConnectQueryOptions<MyTransactionsData>): UseDataConnectQueryResult<MyTransactionsData, undefined>;
