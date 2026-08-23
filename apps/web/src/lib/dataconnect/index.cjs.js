const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'liveboom',
  service: 'liveboom-app-service',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const createMyProfileRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateMyProfile', inputVars);
}
createMyProfileRef.operationName = 'CreateMyProfile';
exports.createMyProfileRef = createMyProfileRef;

exports.createMyProfile = function createMyProfile(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createMyProfileRef(dcInstance, inputVars));
}
;

const updateMyProfileRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateMyProfile', inputVars);
}
updateMyProfileRef.operationName = 'UpdateMyProfile';
exports.updateMyProfileRef = updateMyProfileRef;

exports.updateMyProfile = function updateMyProfile(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateMyProfileRef(dcInstance, inputVars));
}
;

const startMyStreamRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StartMyStream', inputVars);
}
startMyStreamRef.operationName = 'StartMyStream';
exports.startMyStreamRef = startMyStreamRef;

exports.startMyStream = function startMyStream(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(startMyStreamRef(dcInstance, inputVars));
}
;

const endMyStreamRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'EndMyStream', inputVars);
}
endMyStreamRef.operationName = 'EndMyStream';
exports.endMyStreamRef = endMyStreamRef;

exports.endMyStream = function endMyStream(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(endMyStreamRef(dcInstance, inputVars));
}
;

const createMyTransactionRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateMyTransaction', inputVars);
}
createMyTransactionRef.operationName = 'CreateMyTransaction';
exports.createMyTransactionRef = createMyTransactionRef;

exports.createMyTransaction = function createMyTransaction(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createMyTransactionRef(dcInstance, inputVars));
}
;

const sendStreamGiftRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'SendStreamGift', inputVars);
}
sendStreamGiftRef.operationName = 'SendStreamGift';
exports.sendStreamGiftRef = sendStreamGiftRef;

exports.sendStreamGift = function sendStreamGift(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(sendStreamGiftRef(dcInstance, inputVars));
}
;

const listLiveStreamsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListLiveStreams');
}
listLiveStreamsRef.operationName = 'ListLiveStreams';
exports.listLiveStreamsRef = listLiveStreamsRef;

exports.listLiveStreams = function listLiveStreams(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listLiveStreamsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const listGiftsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListGifts');
}
listGiftsRef.operationName = 'ListGifts';
exports.listGiftsRef = listGiftsRef;

exports.listGifts = function listGifts(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listGiftsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const myWalletRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyWallet');
}
myWalletRef.operationName = 'MyWallet';
exports.myWalletRef = myWalletRef;

exports.myWallet = function myWallet(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(myWalletRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const getUserByUsernameRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserByUsername', inputVars);
}
getUserByUsernameRef.operationName = 'GetUserByUsername';
exports.getUserByUsernameRef = getUserByUsernameRef;

exports.getUserByUsername = function getUserByUsername(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getUserByUsernameRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const searchUsersRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'SearchUsers', inputVars);
}
searchUsersRef.operationName = 'SearchUsers';
exports.searchUsersRef = searchUsersRef;

exports.searchUsers = function searchUsers(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(searchUsersRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const myTransactionsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyTransactions');
}
myTransactionsRef.operationName = 'MyTransactions';
exports.myTransactionsRef = myTransactionsRef;

exports.myTransactions = function myTransactions(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(myTransactionsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;
