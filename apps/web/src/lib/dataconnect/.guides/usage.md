# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useCreateMyProfile, useUpdateMyProfile, useStartMyStream, useEndMyStream, useCreateMyTransaction, useSendStreamGift, useListLiveStreams, useListGifts, useMyWallet, useGetUserByUsername } from '@liveboom/dataconnect/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useCreateMyProfile(createMyProfileVars);

const { data, isPending, isSuccess, isError, error } = useUpdateMyProfile(updateMyProfileVars);

const { data, isPending, isSuccess, isError, error } = useStartMyStream(startMyStreamVars);

const { data, isPending, isSuccess, isError, error } = useEndMyStream(endMyStreamVars);

const { data, isPending, isSuccess, isError, error } = useCreateMyTransaction(createMyTransactionVars);

const { data, isPending, isSuccess, isError, error } = useSendStreamGift(sendStreamGiftVars);

const { data, isPending, isSuccess, isError, error } = useListLiveStreams();

const { data, isPending, isSuccess, isError, error } = useListGifts();

const { data, isPending, isSuccess, isError, error } = useMyWallet();

const { data, isPending, isSuccess, isError, error } = useGetUserByUsername(getUserByUsernameVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createMyProfile, updateMyProfile, startMyStream, endMyStream, createMyTransaction, sendStreamGift, listLiveStreams, listGifts, myWallet, getUserByUsername } from '@liveboom/dataconnect';


// Operation CreateMyProfile:  For variables, look at type CreateMyProfileVars in ../index.d.ts
const { data } = await CreateMyProfile(dataConnect, createMyProfileVars);

// Operation UpdateMyProfile:  For variables, look at type UpdateMyProfileVars in ../index.d.ts
const { data } = await UpdateMyProfile(dataConnect, updateMyProfileVars);

// Operation StartMyStream:  For variables, look at type StartMyStreamVars in ../index.d.ts
const { data } = await StartMyStream(dataConnect, startMyStreamVars);

// Operation EndMyStream:  For variables, look at type EndMyStreamVars in ../index.d.ts
const { data } = await EndMyStream(dataConnect, endMyStreamVars);

// Operation CreateMyTransaction:  For variables, look at type CreateMyTransactionVars in ../index.d.ts
const { data } = await CreateMyTransaction(dataConnect, createMyTransactionVars);

// Operation SendStreamGift:  For variables, look at type SendStreamGiftVars in ../index.d.ts
const { data } = await SendStreamGift(dataConnect, sendStreamGiftVars);

// Operation ListLiveStreams: 
const { data } = await ListLiveStreams(dataConnect);

// Operation ListGifts: 
const { data } = await ListGifts(dataConnect);

// Operation MyWallet: 
const { data } = await MyWallet(dataConnect);

// Operation GetUserByUsername:  For variables, look at type GetUserByUsernameVars in ../index.d.ts
const { data } = await GetUserByUsername(dataConnect, getUserByUsernameVars);


```