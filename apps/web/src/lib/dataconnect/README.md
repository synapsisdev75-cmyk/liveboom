# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `liveboom`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
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

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `liveboom`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@liveboom/dataconnect` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `liveboom` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListLiveStreams
You can execute the `ListLiveStreams` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
listLiveStreams(options?: ExecuteQueryOptions): QueryPromise<ListLiveStreamsData, undefined>;

interface ListLiveStreamsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListLiveStreamsData, undefined>;
}
export const listLiveStreamsRef: ListLiveStreamsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listLiveStreams(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListLiveStreamsData, undefined>;

interface ListLiveStreamsRef {
  ...
  (dc: DataConnect): QueryRef<ListLiveStreamsData, undefined>;
}
export const listLiveStreamsRef: ListLiveStreamsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listLiveStreamsRef:
```typescript
const name = listLiveStreamsRef.operationName;
console.log(name);
```

### Variables
The `ListLiveStreams` query has no variables.
### Return Type
Recall that executing the `ListLiveStreams` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListLiveStreamsData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `ListLiveStreams`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listLiveStreams } from '@liveboom/dataconnect';


// Call the `listLiveStreams()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listLiveStreams();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listLiveStreams(dataConnect);

console.log(data.streams);

// Or, you can use the `Promise` API.
listLiveStreams().then((response) => {
  const data = response.data;
  console.log(data.streams);
});
```

### Using `ListLiveStreams`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listLiveStreamsRef } from '@liveboom/dataconnect';


// Call the `listLiveStreamsRef()` function to get a reference to the query.
const ref = listLiveStreamsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listLiveStreamsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.streams);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.streams);
});
```

## ListGifts
You can execute the `ListGifts` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
listGifts(options?: ExecuteQueryOptions): QueryPromise<ListGiftsData, undefined>;

interface ListGiftsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListGiftsData, undefined>;
}
export const listGiftsRef: ListGiftsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listGifts(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListGiftsData, undefined>;

interface ListGiftsRef {
  ...
  (dc: DataConnect): QueryRef<ListGiftsData, undefined>;
}
export const listGiftsRef: ListGiftsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listGiftsRef:
```typescript
const name = listGiftsRef.operationName;
console.log(name);
```

### Variables
The `ListGifts` query has no variables.
### Return Type
Recall that executing the `ListGifts` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListGiftsData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListGiftsData {
  gifts: ({
    id: UUIDString;
    name: string;
    imageUrl: string;
    coinPrice: number;
  } & Gift_Key)[];
}
```
### Using `ListGifts`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listGifts } from '@liveboom/dataconnect';


// Call the `listGifts()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listGifts();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listGifts(dataConnect);

console.log(data.gifts);

// Or, you can use the `Promise` API.
listGifts().then((response) => {
  const data = response.data;
  console.log(data.gifts);
});
```

### Using `ListGifts`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listGiftsRef } from '@liveboom/dataconnect';


// Call the `listGiftsRef()` function to get a reference to the query.
const ref = listGiftsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listGiftsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.gifts);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.gifts);
});
```

## MyWallet
You can execute the `MyWallet` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
myWallet(options?: ExecuteQueryOptions): QueryPromise<MyWalletData, undefined>;

interface MyWalletRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyWalletData, undefined>;
}
export const myWalletRef: MyWalletRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myWallet(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyWalletData, undefined>;

interface MyWalletRef {
  ...
  (dc: DataConnect): QueryRef<MyWalletData, undefined>;
}
export const myWalletRef: MyWalletRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myWalletRef:
```typescript
const name = myWalletRef.operationName;
console.log(name);
```

### Variables
The `MyWallet` query has no variables.
### Return Type
Recall that executing the `MyWallet` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyWalletData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `MyWallet`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myWallet } from '@liveboom/dataconnect';


// Call the `myWallet()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myWallet();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myWallet(dataConnect);

console.log(data.users);

// Or, you can use the `Promise` API.
myWallet().then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `MyWallet`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myWalletRef } from '@liveboom/dataconnect';


// Call the `myWalletRef()` function to get a reference to the query.
const ref = myWalletRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myWalletRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## GetUserByUsername
You can execute the `GetUserByUsername` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
getUserByUsername(vars: GetUserByUsernameVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUsernameData, GetUserByUsernameVariables>;

interface GetUserByUsernameRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByUsernameVariables): QueryRef<GetUserByUsernameData, GetUserByUsernameVariables>;
}
export const getUserByUsernameRef: GetUserByUsernameRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUserByUsername(dc: DataConnect, vars: GetUserByUsernameVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUsernameData, GetUserByUsernameVariables>;

interface GetUserByUsernameRef {
  ...
  (dc: DataConnect, vars: GetUserByUsernameVariables): QueryRef<GetUserByUsernameData, GetUserByUsernameVariables>;
}
export const getUserByUsernameRef: GetUserByUsernameRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserByUsernameRef:
```typescript
const name = getUserByUsernameRef.operationName;
console.log(name);
```

### Variables
The `GetUserByUsername` query requires an argument of type `GetUserByUsernameVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetUserByUsernameVariables {
  username: string;
}
```
### Return Type
Recall that executing the `GetUserByUsername` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserByUsernameData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `GetUserByUsername`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUserByUsername, GetUserByUsernameVariables } from '@liveboom/dataconnect';

// The `GetUserByUsername` query requires an argument of type `GetUserByUsernameVariables`:
const getUserByUsernameVars: GetUserByUsernameVariables = {
  username: ..., 
};

// Call the `getUserByUsername()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUserByUsername(getUserByUsernameVars);
// Variables can be defined inline as well.
const { data } = await getUserByUsername({ username: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUserByUsername(dataConnect, getUserByUsernameVars);

console.log(data.users);

// Or, you can use the `Promise` API.
getUserByUsername(getUserByUsernameVars).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `GetUserByUsername`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserByUsernameRef, GetUserByUsernameVariables } from '@liveboom/dataconnect';

// The `GetUserByUsername` query requires an argument of type `GetUserByUsernameVariables`:
const getUserByUsernameVars: GetUserByUsernameVariables = {
  username: ..., 
};

// Call the `getUserByUsernameRef()` function to get a reference to the query.
const ref = getUserByUsernameRef(getUserByUsernameVars);
// Variables can be defined inline as well.
const ref = getUserByUsernameRef({ username: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserByUsernameRef(dataConnect, getUserByUsernameVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## SearchUsers
You can execute the `SearchUsers` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
searchUsers(vars: SearchUsersVariables, options?: ExecuteQueryOptions): QueryPromise<SearchUsersData, SearchUsersVariables>;

interface SearchUsersRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchUsersVariables): QueryRef<SearchUsersData, SearchUsersVariables>;
}
export const searchUsersRef: SearchUsersRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
searchUsers(dc: DataConnect, vars: SearchUsersVariables, options?: ExecuteQueryOptions): QueryPromise<SearchUsersData, SearchUsersVariables>;

interface SearchUsersRef {
  ...
  (dc: DataConnect, vars: SearchUsersVariables): QueryRef<SearchUsersData, SearchUsersVariables>;
}
export const searchUsersRef: SearchUsersRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the searchUsersRef:
```typescript
const name = searchUsersRef.operationName;
console.log(name);
```

### Variables
The `SearchUsers` query requires an argument of type `SearchUsersVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SearchUsersVariables {
  needle: string;
}
```
### Return Type
Recall that executing the `SearchUsers` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SearchUsersData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `SearchUsers`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, searchUsers, SearchUsersVariables } from '@liveboom/dataconnect';

// The `SearchUsers` query requires an argument of type `SearchUsersVariables`:
const searchUsersVars: SearchUsersVariables = {
  needle: ..., 
};

// Call the `searchUsers()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await searchUsers(searchUsersVars);
// Variables can be defined inline as well.
const { data } = await searchUsers({ needle: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await searchUsers(dataConnect, searchUsersVars);

console.log(data.users);

// Or, you can use the `Promise` API.
searchUsers(searchUsersVars).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `SearchUsers`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, searchUsersRef, SearchUsersVariables } from '@liveboom/dataconnect';

// The `SearchUsers` query requires an argument of type `SearchUsersVariables`:
const searchUsersVars: SearchUsersVariables = {
  needle: ..., 
};

// Call the `searchUsersRef()` function to get a reference to the query.
const ref = searchUsersRef(searchUsersVars);
// Variables can be defined inline as well.
const ref = searchUsersRef({ needle: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = searchUsersRef(dataConnect, searchUsersVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## MyTransactions
You can execute the `MyTransactions` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
myTransactions(options?: ExecuteQueryOptions): QueryPromise<MyTransactionsData, undefined>;

interface MyTransactionsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyTransactionsData, undefined>;
}
export const myTransactionsRef: MyTransactionsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myTransactions(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyTransactionsData, undefined>;

interface MyTransactionsRef {
  ...
  (dc: DataConnect): QueryRef<MyTransactionsData, undefined>;
}
export const myTransactionsRef: MyTransactionsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myTransactionsRef:
```typescript
const name = myTransactionsRef.operationName;
console.log(name);
```

### Variables
The `MyTransactions` query has no variables.
### Return Type
Recall that executing the `MyTransactions` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyTransactionsData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `MyTransactions`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myTransactions } from '@liveboom/dataconnect';


// Call the `myTransactions()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myTransactions();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myTransactions(dataConnect);

console.log(data.transactions);

// Or, you can use the `Promise` API.
myTransactions().then((response) => {
  const data = response.data;
  console.log(data.transactions);
});
```

### Using `MyTransactions`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myTransactionsRef } from '@liveboom/dataconnect';


// Call the `myTransactionsRef()` function to get a reference to the query.
const ref = myTransactionsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myTransactionsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.transactions);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.transactions);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `liveboom` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateMyProfile
You can execute the `CreateMyProfile` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
createMyProfile(vars: CreateMyProfileVariables): MutationPromise<CreateMyProfileData, CreateMyProfileVariables>;

interface CreateMyProfileRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateMyProfileVariables): MutationRef<CreateMyProfileData, CreateMyProfileVariables>;
}
export const createMyProfileRef: CreateMyProfileRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createMyProfile(dc: DataConnect, vars: CreateMyProfileVariables): MutationPromise<CreateMyProfileData, CreateMyProfileVariables>;

interface CreateMyProfileRef {
  ...
  (dc: DataConnect, vars: CreateMyProfileVariables): MutationRef<CreateMyProfileData, CreateMyProfileVariables>;
}
export const createMyProfileRef: CreateMyProfileRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createMyProfileRef:
```typescript
const name = createMyProfileRef.operationName;
console.log(name);
```

### Variables
The `CreateMyProfile` mutation requires an argument of type `CreateMyProfileVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}
```
### Return Type
Recall that executing the `CreateMyProfile` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateMyProfileData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateMyProfileData {
  user_insert: User_Key;
}
```
### Using `CreateMyProfile`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createMyProfile, CreateMyProfileVariables } from '@liveboom/dataconnect';

// The `CreateMyProfile` mutation requires an argument of type `CreateMyProfileVariables`:
const createMyProfileVars: CreateMyProfileVariables = {
  username: ..., 
  email: ..., 
  avatarUrl: ..., // optional
  bio: ..., // optional
};

// Call the `createMyProfile()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createMyProfile(createMyProfileVars);
// Variables can be defined inline as well.
const { data } = await createMyProfile({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createMyProfile(dataConnect, createMyProfileVars);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createMyProfile(createMyProfileVars).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateMyProfile`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createMyProfileRef, CreateMyProfileVariables } from '@liveboom/dataconnect';

// The `CreateMyProfile` mutation requires an argument of type `CreateMyProfileVariables`:
const createMyProfileVars: CreateMyProfileVariables = {
  username: ..., 
  email: ..., 
  avatarUrl: ..., // optional
  bio: ..., // optional
};

// Call the `createMyProfileRef()` function to get a reference to the mutation.
const ref = createMyProfileRef(createMyProfileVars);
// Variables can be defined inline as well.
const ref = createMyProfileRef({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createMyProfileRef(dataConnect, createMyProfileVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## UpdateMyProfile
You can execute the `UpdateMyProfile` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
updateMyProfile(vars: UpdateMyProfileVariables): MutationPromise<UpdateMyProfileData, UpdateMyProfileVariables>;

interface UpdateMyProfileRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateMyProfileVariables): MutationRef<UpdateMyProfileData, UpdateMyProfileVariables>;
}
export const updateMyProfileRef: UpdateMyProfileRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateMyProfile(dc: DataConnect, vars: UpdateMyProfileVariables): MutationPromise<UpdateMyProfileData, UpdateMyProfileVariables>;

interface UpdateMyProfileRef {
  ...
  (dc: DataConnect, vars: UpdateMyProfileVariables): MutationRef<UpdateMyProfileData, UpdateMyProfileVariables>;
}
export const updateMyProfileRef: UpdateMyProfileRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateMyProfileRef:
```typescript
const name = updateMyProfileRef.operationName;
console.log(name);
```

### Variables
The `UpdateMyProfile` mutation requires an argument of type `UpdateMyProfileVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateMyProfileVariables {
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
}
```
### Return Type
Recall that executing the `UpdateMyProfile` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateMyProfileData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateMyProfileData {
  user_updateMany: number;
}
```
### Using `UpdateMyProfile`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateMyProfile, UpdateMyProfileVariables } from '@liveboom/dataconnect';

// The `UpdateMyProfile` mutation requires an argument of type `UpdateMyProfileVariables`:
const updateMyProfileVars: UpdateMyProfileVariables = {
  username: ..., 
  email: ..., 
  avatarUrl: ..., // optional
  bio: ..., // optional
};

// Call the `updateMyProfile()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateMyProfile(updateMyProfileVars);
// Variables can be defined inline as well.
const { data } = await updateMyProfile({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateMyProfile(dataConnect, updateMyProfileVars);

console.log(data.user_updateMany);

// Or, you can use the `Promise` API.
updateMyProfile(updateMyProfileVars).then((response) => {
  const data = response.data;
  console.log(data.user_updateMany);
});
```

### Using `UpdateMyProfile`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateMyProfileRef, UpdateMyProfileVariables } from '@liveboom/dataconnect';

// The `UpdateMyProfile` mutation requires an argument of type `UpdateMyProfileVariables`:
const updateMyProfileVars: UpdateMyProfileVariables = {
  username: ..., 
  email: ..., 
  avatarUrl: ..., // optional
  bio: ..., // optional
};

// Call the `updateMyProfileRef()` function to get a reference to the mutation.
const ref = updateMyProfileRef(updateMyProfileVars);
// Variables can be defined inline as well.
const ref = updateMyProfileRef({ username: ..., email: ..., avatarUrl: ..., bio: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateMyProfileRef(dataConnect, updateMyProfileVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_updateMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_updateMany);
});
```

## StartMyStream
You can execute the `StartMyStream` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
startMyStream(vars: StartMyStreamVariables): MutationPromise<StartMyStreamData, StartMyStreamVariables>;

interface StartMyStreamRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: StartMyStreamVariables): MutationRef<StartMyStreamData, StartMyStreamVariables>;
}
export const startMyStreamRef: StartMyStreamRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
startMyStream(dc: DataConnect, vars: StartMyStreamVariables): MutationPromise<StartMyStreamData, StartMyStreamVariables>;

interface StartMyStreamRef {
  ...
  (dc: DataConnect, vars: StartMyStreamVariables): MutationRef<StartMyStreamData, StartMyStreamVariables>;
}
export const startMyStreamRef: StartMyStreamRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the startMyStreamRef:
```typescript
const name = startMyStreamRef.operationName;
console.log(name);
```

### Variables
The `StartMyStream` mutation requires an argument of type `StartMyStreamVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface StartMyStreamVariables {
  title: string;
  isPrivate: boolean;
  lockPrice?: number | null;
}
```
### Return Type
Recall that executing the `StartMyStream` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `StartMyStreamData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
### Using `StartMyStream`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, startMyStream, StartMyStreamVariables } from '@liveboom/dataconnect';

// The `StartMyStream` mutation requires an argument of type `StartMyStreamVariables`:
const startMyStreamVars: StartMyStreamVariables = {
  title: ..., 
  isPrivate: ..., 
  lockPrice: ..., // optional
};

// Call the `startMyStream()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await startMyStream(startMyStreamVars);
// Variables can be defined inline as well.
const { data } = await startMyStream({ title: ..., isPrivate: ..., lockPrice: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await startMyStream(dataConnect, startMyStreamVars);

console.log(data.query);
console.log(data.stream_insert);

// Or, you can use the `Promise` API.
startMyStream(startMyStreamVars).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.stream_insert);
});
```

### Using `StartMyStream`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, startMyStreamRef, StartMyStreamVariables } from '@liveboom/dataconnect';

// The `StartMyStream` mutation requires an argument of type `StartMyStreamVariables`:
const startMyStreamVars: StartMyStreamVariables = {
  title: ..., 
  isPrivate: ..., 
  lockPrice: ..., // optional
};

// Call the `startMyStreamRef()` function to get a reference to the mutation.
const ref = startMyStreamRef(startMyStreamVars);
// Variables can be defined inline as well.
const ref = startMyStreamRef({ title: ..., isPrivate: ..., lockPrice: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = startMyStreamRef(dataConnect, startMyStreamVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.query);
console.log(data.stream_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.stream_insert);
});
```

## EndMyStream
You can execute the `EndMyStream` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
endMyStream(vars: EndMyStreamVariables): MutationPromise<EndMyStreamData, EndMyStreamVariables>;

interface EndMyStreamRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: EndMyStreamVariables): MutationRef<EndMyStreamData, EndMyStreamVariables>;
}
export const endMyStreamRef: EndMyStreamRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
endMyStream(dc: DataConnect, vars: EndMyStreamVariables): MutationPromise<EndMyStreamData, EndMyStreamVariables>;

interface EndMyStreamRef {
  ...
  (dc: DataConnect, vars: EndMyStreamVariables): MutationRef<EndMyStreamData, EndMyStreamVariables>;
}
export const endMyStreamRef: EndMyStreamRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the endMyStreamRef:
```typescript
const name = endMyStreamRef.operationName;
console.log(name);
```

### Variables
The `EndMyStream` mutation requires an argument of type `EndMyStreamVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface EndMyStreamVariables {
  streamId: UUIDString;
}
```
### Return Type
Recall that executing the `EndMyStream` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `EndMyStreamData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface EndMyStreamData {
  stream_update?: Stream_Key | null;
}
```
### Using `EndMyStream`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, endMyStream, EndMyStreamVariables } from '@liveboom/dataconnect';

// The `EndMyStream` mutation requires an argument of type `EndMyStreamVariables`:
const endMyStreamVars: EndMyStreamVariables = {
  streamId: ..., 
};

// Call the `endMyStream()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await endMyStream(endMyStreamVars);
// Variables can be defined inline as well.
const { data } = await endMyStream({ streamId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await endMyStream(dataConnect, endMyStreamVars);

console.log(data.stream_update);

// Or, you can use the `Promise` API.
endMyStream(endMyStreamVars).then((response) => {
  const data = response.data;
  console.log(data.stream_update);
});
```

### Using `EndMyStream`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, endMyStreamRef, EndMyStreamVariables } from '@liveboom/dataconnect';

// The `EndMyStream` mutation requires an argument of type `EndMyStreamVariables`:
const endMyStreamVars: EndMyStreamVariables = {
  streamId: ..., 
};

// Call the `endMyStreamRef()` function to get a reference to the mutation.
const ref = endMyStreamRef(endMyStreamVars);
// Variables can be defined inline as well.
const ref = endMyStreamRef({ streamId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = endMyStreamRef(dataConnect, endMyStreamVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.stream_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.stream_update);
});
```

## CreateMyTransaction
You can execute the `CreateMyTransaction` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
createMyTransaction(vars: CreateMyTransactionVariables): MutationPromise<CreateMyTransactionData, CreateMyTransactionVariables>;

interface CreateMyTransactionRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateMyTransactionVariables): MutationRef<CreateMyTransactionData, CreateMyTransactionVariables>;
}
export const createMyTransactionRef: CreateMyTransactionRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createMyTransaction(dc: DataConnect, vars: CreateMyTransactionVariables): MutationPromise<CreateMyTransactionData, CreateMyTransactionVariables>;

interface CreateMyTransactionRef {
  ...
  (dc: DataConnect, vars: CreateMyTransactionVariables): MutationRef<CreateMyTransactionData, CreateMyTransactionVariables>;
}
export const createMyTransactionRef: CreateMyTransactionRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createMyTransactionRef:
```typescript
const name = createMyTransactionRef.operationName;
console.log(name);
```

### Variables
The `CreateMyTransaction` mutation requires an argument of type `CreateMyTransactionVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateMyTransactionVariables {
  amount: number;
  transactionType: string;
  status: string;
  referenceId?: UUIDString | null;
}
```
### Return Type
Recall that executing the `CreateMyTransaction` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateMyTransactionData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateMyTransactionData {
  query?: {
    user?: {
      id: UUIDString;
    } & User_Key;
  };
  transaction_insert: Transaction_Key;
}
```
### Using `CreateMyTransaction`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createMyTransaction, CreateMyTransactionVariables } from '@liveboom/dataconnect';

// The `CreateMyTransaction` mutation requires an argument of type `CreateMyTransactionVariables`:
const createMyTransactionVars: CreateMyTransactionVariables = {
  amount: ..., 
  transactionType: ..., 
  status: ..., 
  referenceId: ..., // optional
};

// Call the `createMyTransaction()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createMyTransaction(createMyTransactionVars);
// Variables can be defined inline as well.
const { data } = await createMyTransaction({ amount: ..., transactionType: ..., status: ..., referenceId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createMyTransaction(dataConnect, createMyTransactionVars);

console.log(data.query);
console.log(data.transaction_insert);

// Or, you can use the `Promise` API.
createMyTransaction(createMyTransactionVars).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.transaction_insert);
});
```

### Using `CreateMyTransaction`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createMyTransactionRef, CreateMyTransactionVariables } from '@liveboom/dataconnect';

// The `CreateMyTransaction` mutation requires an argument of type `CreateMyTransactionVariables`:
const createMyTransactionVars: CreateMyTransactionVariables = {
  amount: ..., 
  transactionType: ..., 
  status: ..., 
  referenceId: ..., // optional
};

// Call the `createMyTransactionRef()` function to get a reference to the mutation.
const ref = createMyTransactionRef(createMyTransactionVars);
// Variables can be defined inline as well.
const ref = createMyTransactionRef({ amount: ..., transactionType: ..., status: ..., referenceId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createMyTransactionRef(dataConnect, createMyTransactionVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.query);
console.log(data.transaction_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.transaction_insert);
});
```

## SendStreamGift
You can execute the `SendStreamGift` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
sendStreamGift(vars: SendStreamGiftVariables): MutationPromise<SendStreamGiftData, SendStreamGiftVariables>;

interface SendStreamGiftRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SendStreamGiftVariables): MutationRef<SendStreamGiftData, SendStreamGiftVariables>;
}
export const sendStreamGiftRef: SendStreamGiftRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
sendStreamGift(dc: DataConnect, vars: SendStreamGiftVariables): MutationPromise<SendStreamGiftData, SendStreamGiftVariables>;

interface SendStreamGiftRef {
  ...
  (dc: DataConnect, vars: SendStreamGiftVariables): MutationRef<SendStreamGiftData, SendStreamGiftVariables>;
}
export const sendStreamGiftRef: SendStreamGiftRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the sendStreamGiftRef:
```typescript
const name = sendStreamGiftRef.operationName;
console.log(name);
```

### Variables
The `SendStreamGift` mutation requires an argument of type `SendStreamGiftVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SendStreamGiftVariables {
  streamId: UUIDString;
  receiverId: UUIDString;
  giftId: UUIDString;
  quantity: number;
}
```
### Return Type
Recall that executing the `SendStreamGift` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SendStreamGiftData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SendStreamGiftData {
  query?: {
    sender?: {
      id: UUIDString;
    } & User_Key;
  };
  streamGift_insert: StreamGift_Key;
}
```
### Using `SendStreamGift`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, sendStreamGift, SendStreamGiftVariables } from '@liveboom/dataconnect';

// The `SendStreamGift` mutation requires an argument of type `SendStreamGiftVariables`:
const sendStreamGiftVars: SendStreamGiftVariables = {
  streamId: ..., 
  receiverId: ..., 
  giftId: ..., 
  quantity: ..., 
};

// Call the `sendStreamGift()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await sendStreamGift(sendStreamGiftVars);
// Variables can be defined inline as well.
const { data } = await sendStreamGift({ streamId: ..., receiverId: ..., giftId: ..., quantity: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await sendStreamGift(dataConnect, sendStreamGiftVars);

console.log(data.query);
console.log(data.streamGift_insert);

// Or, you can use the `Promise` API.
sendStreamGift(sendStreamGiftVars).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.streamGift_insert);
});
```

### Using `SendStreamGift`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, sendStreamGiftRef, SendStreamGiftVariables } from '@liveboom/dataconnect';

// The `SendStreamGift` mutation requires an argument of type `SendStreamGiftVariables`:
const sendStreamGiftVars: SendStreamGiftVariables = {
  streamId: ..., 
  receiverId: ..., 
  giftId: ..., 
  quantity: ..., 
};

// Call the `sendStreamGiftRef()` function to get a reference to the mutation.
const ref = sendStreamGiftRef(sendStreamGiftVars);
// Variables can be defined inline as well.
const ref = sendStreamGiftRef({ streamId: ..., receiverId: ..., giftId: ..., quantity: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = sendStreamGiftRef(dataConnect, sendStreamGiftVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.query);
console.log(data.streamGift_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.query);
  console.log(data.streamGift_insert);
});
```

