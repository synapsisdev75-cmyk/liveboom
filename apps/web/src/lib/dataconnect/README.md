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
- [**Mutations**](#mutations)
  - [*CreateMyProfile*](#createmyprofile)

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
};

// Call the `createMyProfile()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createMyProfile(createMyProfileVars);
// Variables can be defined inline as well.
const { data } = await createMyProfile({ username: ..., email: ..., avatarUrl: ..., });

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
};

// Call the `createMyProfileRef()` function to get a reference to the mutation.
const ref = createMyProfileRef(createMyProfileVars);
// Variables can be defined inline as well.
const ref = createMyProfileRef({ username: ..., email: ..., avatarUrl: ..., });

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

