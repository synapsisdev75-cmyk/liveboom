# Generated React README
This README will guide you through the process of using the generated React SDK package for the connector `liveboom`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `JavaScript README`, you can find it at [`dataconnect/README.md`](../README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

You can use this generated SDK by importing from the package `@liveboom/dataconnect/react` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#react).

# Table of Contents
- [**Overview**](#generated-react-readme)
- [**TanStack Query Firebase & TanStack React Query**](#tanstack-query-firebase-tanstack-react-query)
  - [*Package Installation*](#installing-tanstack-query-firebase-and-tanstack-react-query-packages)
  - [*Configuring TanStack Query*](#configuring-tanstack-query)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListLiveStreams*](#listlivestreams)
  - [*ListGifts*](#listgifts)
  - [*MyWallet*](#mywallet)
  - [*GetUserByUsername*](#getuserbyusername)
  - [*SearchUsers*](#searchusers)
  - [*MyTransactions*](#mytransactions)
- [**Mutations**](#mutations)
  - [*CreateMyProfile*](#createmyprofile)
  - [*UpdateMyProfile*](#updatemyprofile)
  - [*StartMyStream*](#startmystream)
  - [*EndMyStream*](#endmystream)
  - [*CreateMyTransaction*](#createmytransaction)
  - [*SendStreamGift*](#sendstreamgift)

# TanStack Query Firebase & TanStack React Query
This SDK provides [React](https://react.dev/) hooks generated specific to your application, for the operations found in the connector `liveboom`. These hooks are generated using [TanStack Query Firebase](https://react-query-firebase.invertase.dev/) by our partners at Invertase, a library built on top of [TanStack React Query v5](https://tanstack.com/query/v5/docs/framework/react/overview).

***You do not need to be familiar with Tanstack Query or Tanstack Query Firebase to use this SDK.*** However, you may find it useful to learn more about them, as they will empower you as a user of this Generated React SDK.

## Installing TanStack Query Firebase and TanStack React Query Packages
In order to use the React generated SDK, you must install the `TanStack React Query` and `TanStack Query Firebase` packages.
```bash
npm i --save @tanstack/react-query @tanstack-query-firebase/react
```
```bash
npm i --save firebase@latest # Note: React has a peer dependency on ^11.3.0
```

You can also follow the installation instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#tanstack-install), or the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react) and [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/installation).

## Configuring TanStack Query
In order to use the React generated SDK in your application, you must wrap your application's component tree in a `QueryClientProvider` component from TanStack React Query. None of your generated React SDK hooks will work without this provider.

```javascript
import { QueryClientProvider } from '@tanstack/react-query';

// Create a TanStack Query client instance
const queryClient = new QueryClient()

function App() {
  return (
    // Provide the client to your App
    <QueryClientProvider client={queryClient}>
      <MyApplication />
    </QueryClientProvider>
  )
}
```

To learn more about `QueryClientProvider`, see the [TanStack React Query documentation](https://tanstack.com/query/latest/docs/framework/react/quick-start) and the [TanStack Query Firebase documentation](https://invertase.docs.page/tanstack-query-firebase/react#usage).

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `liveboom`.

You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#emulator-react-angular).

```javascript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) using the hooks provided from your generated React SDK.

# Queries

The React generated SDK provides Query hook functions that call and return [`useDataConnectQuery`](https://react-query-firebase.invertase.dev/react/data-connect/querying) hooks from TanStack Query Firebase.

Calling these hook functions will return a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and the most recent data returned by the Query, among other things. To learn more about these hooks and how to use them, see the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react/data-connect/querying).

TanStack React Query caches the results of your Queries, so using the same Query hook function in multiple places in your application allows the entire application to automatically see updates to that Query's data.

Query hooks execute their Queries automatically when called, and periodically refresh, unless you change the `queryOptions` for the Query. To learn how to stop a Query from automatically executing, including how to make a query "lazy", see the [TanStack React Query documentation](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries).

To learn more about TanStack React Query's Queries, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/queries).

## Using Query Hooks
Here's a general overview of how to use the generated Query hooks in your code:

- If the Query has no variables, the Query hook function does not require arguments.
- If the Query has any required variables, the Query hook function will require at least one argument: an object that contains all the required variables for the Query.
- If the Query has some required and some optional variables, only required variables are necessary in the variables argument object, and optional variables may be provided as well.
- If all of the Query's variables are optional, the Query hook function does not require any arguments.
- Query hook functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.
- Query hooks functions can be called with or without passing in an `options` argument of type `useDataConnectQueryOptions`. To learn more about the `options` argument, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/query-options).
  - ***Special case:***  If the Query has all optional variables and you would like to provide an `options` argument to the Query hook function without providing any variables, you must pass `undefined` where you would normally pass the Query's variables, and then may provide the `options` argument.

Below are examples of how to use the `liveboom` connector's generated Query hook functions to execute each Query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

## ListLiveStreams
You can execute the `ListLiveStreams` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useListLiveStreams(dc: DataConnect, options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useListLiveStreams(options?: useDataConnectQueryOptions<ListLiveStreamsData>): UseDataConnectQueryResult<ListLiveStreamsData, undefined>;
```

### Variables
The `ListLiveStreams` Query has no variables.
### Return Type
Recall that calling the `ListLiveStreams` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ListLiveStreams` Query is of type `ListLiveStreamsData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ListLiveStreams`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';
import { useListLiveStreams } from '@liveboom/dataconnect/react'

export default function ListLiveStreamsComponent() {
  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useListLiveStreams();

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useListLiveStreams(dataConnect);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useListLiveStreams(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useListLiveStreams(dataConnect, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.streams);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## ListGifts
You can execute the `ListGifts` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useListGifts(dc: DataConnect, options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useListGifts(options?: useDataConnectQueryOptions<ListGiftsData>): UseDataConnectQueryResult<ListGiftsData, undefined>;
```

### Variables
The `ListGifts` Query has no variables.
### Return Type
Recall that calling the `ListGifts` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `ListGifts` Query is of type `ListGiftsData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface ListGiftsData {
  gifts: ({
    id: UUIDString;
    name: string;
    imageUrl: string;
    coinPrice: number;
  } & Gift_Key)[];
}
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `ListGifts`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';
import { useListGifts } from '@liveboom/dataconnect/react'

export default function ListGiftsComponent() {
  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useListGifts();

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useListGifts(dataConnect);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useListGifts(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useListGifts(dataConnect, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.gifts);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## MyWallet
You can execute the `MyWallet` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useMyWallet(dc: DataConnect, options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useMyWallet(options?: useDataConnectQueryOptions<MyWalletData>): UseDataConnectQueryResult<MyWalletData, undefined>;
```

### Variables
The `MyWallet` Query has no variables.
### Return Type
Recall that calling the `MyWallet` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `MyWallet` Query is of type `MyWalletData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `MyWallet`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';
import { useMyWallet } from '@liveboom/dataconnect/react'

export default function MyWalletComponent() {
  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useMyWallet();

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useMyWallet(dataConnect);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useMyWallet(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useMyWallet(dataConnect, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.users);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## GetUserByUsername
You can execute the `GetUserByUsername` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useGetUserByUsername(dc: DataConnect, vars: GetUserByUsernameVariables, options?: useDataConnectQueryOptions<GetUserByUsernameData>): UseDataConnectQueryResult<GetUserByUsernameData, GetUserByUsernameVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useGetUserByUsername(vars: GetUserByUsernameVariables, options?: useDataConnectQueryOptions<GetUserByUsernameData>): UseDataConnectQueryResult<GetUserByUsernameData, GetUserByUsernameVariables>;
```

### Variables
The `GetUserByUsername` Query requires an argument of type `GetUserByUsernameVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface GetUserByUsernameVariables {
  username: string;
}
```
### Return Type
Recall that calling the `GetUserByUsername` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `GetUserByUsername` Query is of type `GetUserByUsernameData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `GetUserByUsername`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, GetUserByUsernameVariables } from '@liveboom/dataconnect';
import { useGetUserByUsername } from '@liveboom/dataconnect/react'

export default function GetUserByUsernameComponent() {
  // The `useGetUserByUsername` Query hook requires an argument of type `GetUserByUsernameVariables`:
  const getUserByUsernameVars: GetUserByUsernameVariables = {
    username: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useGetUserByUsername(getUserByUsernameVars);
  // Variables can be defined inline as well.
  const query = useGetUserByUsername({ username: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useGetUserByUsername(dataConnect, getUserByUsernameVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useGetUserByUsername(getUserByUsernameVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useGetUserByUsername(dataConnect, getUserByUsernameVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.users);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## SearchUsers
You can execute the `SearchUsers` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useSearchUsers(dc: DataConnect, vars: SearchUsersVariables, options?: useDataConnectQueryOptions<SearchUsersData>): UseDataConnectQueryResult<SearchUsersData, SearchUsersVariables>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useSearchUsers(vars: SearchUsersVariables, options?: useDataConnectQueryOptions<SearchUsersData>): UseDataConnectQueryResult<SearchUsersData, SearchUsersVariables>;
```

### Variables
The `SearchUsers` Query requires an argument of type `SearchUsersVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface SearchUsersVariables {
  needle: string;
}
```
### Return Type
Recall that calling the `SearchUsers` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `SearchUsers` Query is of type `SearchUsersData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface SearchUsersData {
  users: ({
    id: UUIDString;
    username: string;
    avatarUrl?: string | null;
    bio?: string | null;
    coinsBalance: number;
  } & User_Key)[];
}
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `SearchUsers`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, SearchUsersVariables } from '@liveboom/dataconnect';
import { useSearchUsers } from '@liveboom/dataconnect/react'

export default function SearchUsersComponent() {
  // The `useSearchUsers` Query hook requires an argument of type `SearchUsersVariables`:
  const searchUsersVars: SearchUsersVariables = {
    needle: ..., 
  };

  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useSearchUsers(searchUsersVars);
  // Variables can be defined inline as well.
  const query = useSearchUsers({ needle: ..., });

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useSearchUsers(dataConnect, searchUsersVars);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useSearchUsers(searchUsersVars, options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useSearchUsers(dataConnect, searchUsersVars, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.users);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## MyTransactions
You can execute the `MyTransactions` Query using the following Query hook function, which is defined in [dataconnect/react/index.d.ts](./index.d.ts):

```javascript
useMyTransactions(dc: DataConnect, options?: useDataConnectQueryOptions<MyTransactionsData>): UseDataConnectQueryResult<MyTransactionsData, undefined>;
```
You can also pass in a `DataConnect` instance to the Query hook function.
```javascript
useMyTransactions(options?: useDataConnectQueryOptions<MyTransactionsData>): UseDataConnectQueryResult<MyTransactionsData, undefined>;
```

### Variables
The `MyTransactions` Query has no variables.
### Return Type
Recall that calling the `MyTransactions` Query hook function returns a `UseQueryResult` object. This object holds the state of your Query, including whether the Query is loading, has completed, or has succeeded/failed, and any data returned by the Query, among other things.

To check the status of a Query, use the `UseQueryResult.status` field. You can also check for pending / success / error status using the `UseQueryResult.isPending`, `UseQueryResult.isSuccess`, and `UseQueryResult.isError` fields.

To access the data returned by a Query, use the `UseQueryResult.data` field. The data for the `MyTransactions` Query is of type `MyTransactionsData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
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
```

To learn more about the `UseQueryResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).

### Using `MyTransactions`'s Query hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';
import { useMyTransactions } from '@liveboom/dataconnect/react'

export default function MyTransactionsComponent() {
  // You don't have to do anything to "execute" the Query.
  // Call the Query hook function to get a `UseQueryResult` object which holds the state of your Query.
  const query = useMyTransactions();

  // You can also pass in a `DataConnect` instance to the Query hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const query = useMyTransactions(dataConnect);

  // You can also pass in a `useDataConnectQueryOptions` object to the Query hook function.
  const options = { staleTime: 5 * 1000 };
  const query = useMyTransactions(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectQueryOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = { staleTime: 5 * 1000 };
  const query = useMyTransactions(dataConnect, options);

  // Then, you can render your component dynamically based on the status of the Query.
  if (query.isPending) {
    return <div>Loading...</div>;
  }

  if (query.isError) {
    return <div>Error: {query.error.message}</div>;
  }

  // If the Query is successful, you can access the data returned using the `UseQueryResult.data` field.
  if (query.isSuccess) {
    console.log(query.data.transactions);
  }
  return <div>Query execution {query.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

# Mutations

The React generated SDK provides Mutations hook functions that call and return [`useDataConnectMutation`](https://react-query-firebase.invertase.dev/react/data-connect/mutations) hooks from TanStack Query Firebase.

Calling these hook functions will return a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, and the most recent data returned by the Mutation, among other things. To learn more about these hooks and how to use them, see the [TanStack Query Firebase documentation](https://react-query-firebase.invertase.dev/react/data-connect/mutations).

Mutation hooks do not execute their Mutations automatically when called. Rather, after calling the Mutation hook function and getting a `UseMutationResult` object, you must call the `UseMutationResult.mutate()` function to execute the Mutation.

To learn more about TanStack React Query's Mutations, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations).

## Using Mutation Hooks
Here's a general overview of how to use the generated Mutation hooks in your code:

- Mutation hook functions are not called with the arguments to the Mutation. Instead, arguments are passed to `UseMutationResult.mutate()`.
- If the Mutation has no variables, the `mutate()` function does not require arguments.
- If the Mutation has any required variables, the `mutate()` function will require at least one argument: an object that contains all the required variables for the Mutation.
- If the Mutation has some required and some optional variables, only required variables are necessary in the variables argument object, and optional variables may be provided as well.
- If all of the Mutation's variables are optional, the Mutation hook function does not require any arguments.
- Mutation hook functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.
- Mutation hooks also accept an `options` argument of type `useDataConnectMutationOptions`. To learn more about the `options` argument, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-side-effects).
  - `UseMutationResult.mutate()` also accepts an `options` argument of type `useDataConnectMutationOptions`.
  - ***Special case:*** If the Mutation has no arguments (or all optional arguments and you wish to provide none), and you want to pass `options` to `UseMutationResult.mutate()`, you must pass `undefined` where you would normally pass the Mutation's arguments, and then may provide the options argument.

Below are examples of how to use the `liveboom` connector's generated Mutation hook functions to execute each Mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#operations-react-angular).

## CreateMyProfile
You can execute the `CreateMyProfile` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useCreateMyProfile(options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useCreateMyProfile(dc: DataConnect, options?: useDataConnectMutationOptions<CreateMyProfileData, FirebaseError, CreateMyProfileVariables>): UseDataConnectMutationResult<CreateMyProfileData, CreateMyProfileVariables>;
```

### Variables
The `CreateMyProfile` Mutation requires an argument of type `CreateMyProfileVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface CreateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}
```
### Return Type
Recall that calling the `CreateMyProfile` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `CreateMyProfile` Mutation is of type `CreateMyProfileData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface CreateMyProfileData {
  user_insert: User_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `CreateMyProfile`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, CreateMyProfileVariables } from '@liveboom/dataconnect';
import { useCreateMyProfile } from '@liveboom/dataconnect/react'

export default function CreateMyProfileComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useCreateMyProfile();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useCreateMyProfile(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useCreateMyProfile(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useCreateMyProfile(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useCreateMyProfile` Mutation requires an argument of type `CreateMyProfileVariables`:
  const createMyProfileVars: CreateMyProfileVariables = {
    username: ..., 
    email: ..., 
    avatarUrl: ..., // optional
    bio: ..., // optional
  };
  mutation.mutate(createMyProfileVars);
  // Variables can be defined inline as well.
  mutation.mutate({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(createMyProfileVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.user_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## UpdateMyProfile
You can execute the `UpdateMyProfile` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useUpdateMyProfile(options?: useDataConnectMutationOptions<UpdateMyProfileData, FirebaseError, UpdateMyProfileVariables>): UseDataConnectMutationResult<UpdateMyProfileData, UpdateMyProfileVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useUpdateMyProfile(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateMyProfileData, FirebaseError, UpdateMyProfileVariables>): UseDataConnectMutationResult<UpdateMyProfileData, UpdateMyProfileVariables>;
```

### Variables
The `UpdateMyProfile` Mutation requires an argument of type `UpdateMyProfileVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface UpdateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}
```
### Return Type
Recall that calling the `UpdateMyProfile` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `UpdateMyProfile` Mutation is of type `UpdateMyProfileData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface UpdateMyProfileData {
  user_updateMany: number;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `UpdateMyProfile`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, UpdateMyProfileVariables } from '@liveboom/dataconnect';
import { useUpdateMyProfile } from '@liveboom/dataconnect/react'

export default function UpdateMyProfileComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useUpdateMyProfile();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useUpdateMyProfile(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateMyProfile(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useUpdateMyProfile(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useUpdateMyProfile` Mutation requires an argument of type `UpdateMyProfileVariables`:
  const updateMyProfileVars: UpdateMyProfileVariables = {
    username: ..., 
    email: ..., 
    avatarUrl: ..., // optional
    bio: ..., // optional
  };
  mutation.mutate(updateMyProfileVars);
  // Variables can be defined inline as well.
  mutation.mutate({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(updateMyProfileVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.user_updateMany);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## StartMyStream
You can execute the `StartMyStream` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useStartMyStream(options?: useDataConnectMutationOptions<StartMyStreamData, FirebaseError, StartMyStreamVariables>): UseDataConnectMutationResult<StartMyStreamData, StartMyStreamVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useStartMyStream(dc: DataConnect, options?: useDataConnectMutationOptions<StartMyStreamData, FirebaseError, StartMyStreamVariables>): UseDataConnectMutationResult<StartMyStreamData, StartMyStreamVariables>;
```

### Variables
The `StartMyStream` Mutation requires an argument of type `StartMyStreamVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface StartMyStreamVariables {
  title: string;
  isPrivate: boolean;
  lockPrice?: number | null;
}
```
### Return Type
Recall that calling the `StartMyStream` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `StartMyStream` Mutation is of type `StartMyStreamData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface StartMyStreamData {
  query?: {
    user?: {
      id: UUIDString;
      username: string;
    } & User_Key;
  };
  stream_insert: Stream_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `StartMyStream`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, StartMyStreamVariables } from '@liveboom/dataconnect';
import { useStartMyStream } from '@liveboom/dataconnect/react'

export default function StartMyStreamComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useStartMyStream();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useStartMyStream(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStartMyStream(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useStartMyStream(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useStartMyStream` Mutation requires an argument of type `StartMyStreamVariables`:
  const startMyStreamVars: StartMyStreamVariables = {
    title: ..., 
    isPrivate: ..., 
    lockPrice: ..., // optional
  };
  mutation.mutate(startMyStreamVars);
  // Variables can be defined inline as well.
  mutation.mutate({ title: ..., isPrivate: ..., lockPrice: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(startMyStreamVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.query);
    console.log(mutation.data.stream_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## EndMyStream
You can execute the `EndMyStream` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useEndMyStream(options?: useDataConnectMutationOptions<EndMyStreamData, FirebaseError, EndMyStreamVariables>): UseDataConnectMutationResult<EndMyStreamData, EndMyStreamVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useEndMyStream(dc: DataConnect, options?: useDataConnectMutationOptions<EndMyStreamData, FirebaseError, EndMyStreamVariables>): UseDataConnectMutationResult<EndMyStreamData, EndMyStreamVariables>;
```

### Variables
The `EndMyStream` Mutation requires an argument of type `EndMyStreamVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface EndMyStreamVariables {
  streamId: UUIDString;
}
```
### Return Type
Recall that calling the `EndMyStream` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `EndMyStream` Mutation is of type `EndMyStreamData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface EndMyStreamData {
  stream_update?: Stream_Key | null;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `EndMyStream`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, EndMyStreamVariables } from '@liveboom/dataconnect';
import { useEndMyStream } from '@liveboom/dataconnect/react'

export default function EndMyStreamComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useEndMyStream();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useEndMyStream(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useEndMyStream(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useEndMyStream(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useEndMyStream` Mutation requires an argument of type `EndMyStreamVariables`:
  const endMyStreamVars: EndMyStreamVariables = {
    streamId: ..., 
  };
  mutation.mutate(endMyStreamVars);
  // Variables can be defined inline as well.
  mutation.mutate({ streamId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(endMyStreamVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.stream_update);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## CreateMyTransaction
You can execute the `CreateMyTransaction` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useCreateMyTransaction(options?: useDataConnectMutationOptions<CreateMyTransactionData, FirebaseError, CreateMyTransactionVariables>): UseDataConnectMutationResult<CreateMyTransactionData, CreateMyTransactionVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useCreateMyTransaction(dc: DataConnect, options?: useDataConnectMutationOptions<CreateMyTransactionData, FirebaseError, CreateMyTransactionVariables>): UseDataConnectMutationResult<CreateMyTransactionData, CreateMyTransactionVariables>;
```

### Variables
The `CreateMyTransaction` Mutation requires an argument of type `CreateMyTransactionVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface CreateMyTransactionVariables {
  amount: number;
  transactionType: string;
  status: string;
  referenceId?: UUIDString | null;
}
```
### Return Type
Recall that calling the `CreateMyTransaction` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `CreateMyTransaction` Mutation is of type `CreateMyTransactionData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface CreateMyTransactionData {
  query?: {
    user?: {
      id: UUIDString;
    } & User_Key;
  };
  transaction_insert: Transaction_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `CreateMyTransaction`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, CreateMyTransactionVariables } from '@liveboom/dataconnect';
import { useCreateMyTransaction } from '@liveboom/dataconnect/react'

export default function CreateMyTransactionComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useCreateMyTransaction();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useCreateMyTransaction(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useCreateMyTransaction(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useCreateMyTransaction(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useCreateMyTransaction` Mutation requires an argument of type `CreateMyTransactionVariables`:
  const createMyTransactionVars: CreateMyTransactionVariables = {
    amount: ..., 
    transactionType: ..., 
    status: ..., 
    referenceId: ..., // optional
  };
  mutation.mutate(createMyTransactionVars);
  // Variables can be defined inline as well.
  mutation.mutate({ amount: ..., transactionType: ..., status: ..., referenceId: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(createMyTransactionVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.query);
    console.log(mutation.data.transaction_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

## SendStreamGift
You can execute the `SendStreamGift` Mutation using the `UseMutationResult` object returned by the following Mutation hook function (which is defined in [dataconnect/react/index.d.ts](./index.d.ts)):
```javascript
useSendStreamGift(options?: useDataConnectMutationOptions<SendStreamGiftData, FirebaseError, SendStreamGiftVariables>): UseDataConnectMutationResult<SendStreamGiftData, SendStreamGiftVariables>;
```
You can also pass in a `DataConnect` instance to the Mutation hook function.
```javascript
useSendStreamGift(dc: DataConnect, options?: useDataConnectMutationOptions<SendStreamGiftData, FirebaseError, SendStreamGiftVariables>): UseDataConnectMutationResult<SendStreamGiftData, SendStreamGiftVariables>;
```

### Variables
The `SendStreamGift` Mutation requires an argument of type `SendStreamGiftVariables`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:

```javascript
export interface SendStreamGiftVariables {
  streamId: UUIDString;
  receiverId: UUIDString;
  giftId: UUIDString;
  quantity: number;
}
```
### Return Type
Recall that calling the `SendStreamGift` Mutation hook function returns a `UseMutationResult` object. This object holds the state of your Mutation, including whether the Mutation is loading, has completed, or has succeeded/failed, among other things.

To check the status of a Mutation, use the `UseMutationResult.status` field. You can also check for pending / success / error status using the `UseMutationResult.isPending`, `UseMutationResult.isSuccess`, and `UseMutationResult.isError` fields.

To execute the Mutation, call `UseMutationResult.mutate()`. This function executes the Mutation, but does not return the data from the Mutation.

To access the data returned by a Mutation, use the `UseMutationResult.data` field. The data for the `SendStreamGift` Mutation is of type `SendStreamGiftData`, which is defined in [dataconnect/index.d.ts](../index.d.ts). It has the following fields:
```javascript
export interface SendStreamGiftData {
  query?: {
    sender?: {
      id: UUIDString;
    } & User_Key;
  };
  streamGift_insert: StreamGift_Key;
}
```

To learn more about the `UseMutationResult` object, see the [TanStack React Query documentation](https://tanstack.com/query/v5/docs/framework/react/reference/useMutation).

### Using `SendStreamGift`'s Mutation hook function

```javascript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, SendStreamGiftVariables } from '@liveboom/dataconnect';
import { useSendStreamGift } from '@liveboom/dataconnect/react'

export default function SendStreamGiftComponent() {
  // Call the Mutation hook function to get a `UseMutationResult` object which holds the state of your Mutation.
  const mutation = useSendStreamGift();

  // You can also pass in a `DataConnect` instance to the Mutation hook function.
  const dataConnect = getDataConnect(connectorConfig);
  const mutation = useSendStreamGift(dataConnect);

  // You can also pass in a `useDataConnectMutationOptions` object to the Mutation hook function.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useSendStreamGift(options);

  // You can also pass both a `DataConnect` instance and a `useDataConnectMutationOptions` object.
  const dataConnect = getDataConnect(connectorConfig);
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  const mutation = useSendStreamGift(dataConnect, options);

  // After calling the Mutation hook function, you must call `UseMutationResult.mutate()` to execute the Mutation.
  // The `useSendStreamGift` Mutation requires an argument of type `SendStreamGiftVariables`:
  const sendStreamGiftVars: SendStreamGiftVariables = {
    streamId: ..., 
    receiverId: ..., 
    giftId: ..., 
    quantity: ..., 
  };
  mutation.mutate(sendStreamGiftVars);
  // Variables can be defined inline as well.
  mutation.mutate({ streamId: ..., receiverId: ..., giftId: ..., quantity: ..., });

  // You can also pass in a `useDataConnectMutationOptions` object to `UseMutationResult.mutate()`.
  const options = {
    onSuccess: () => { console.log('Mutation succeeded!'); }
  };
  mutation.mutate(sendStreamGiftVars, options);

  // Then, you can render your component dynamically based on the status of the Mutation.
  if (mutation.isPending) {
    return <div>Loading...</div>;
  }

  if (mutation.isError) {
    return <div>Error: {mutation.error.message}</div>;
  }

  // If the Mutation is successful, you can access the data returned using the `UseMutationResult.data` field.
  if (mutation.isSuccess) {
    console.log(mutation.data.query);
    console.log(mutation.data.streamGift_insert);
  }
  return <div>Mutation execution {mutation.isSuccess ? 'successful' : 'failed'}!</div>;
}
```

