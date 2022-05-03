/**

what's in this file: 
In this file you specify a JS module with some callbacks. Basically those callbacks get calls when you receive an event from the vonage backend. There's also a 
special route function that is called on your conversation function start up allowing your to expose new local http endpoint

the event you can interract here are the same you can specify in your application: https://developer.nexmo.com/application/overview

event callbacks for rtc: 
 - rtcEvent (event, context)

event callbacks for anything else (those one are just standard express middleware access req.nexmo to get the context): 

voice callbacks 
 - voiceEvent (req, res, next)
 - voiceAnswer (req, res, next)

messages callbacks (if you specifiy one of thise, you need to declare both of them, those one are just standard express middleware access req.nexmo ):
- messagesInbound (req, res, next)
- messagesStatus (req, res, next)


route(app) // app is an express app




nexmo context: 
you can find this as the second parameter of rtcEvent funciton or as part or the request in req.nexmo in every request received by the handler 
you specify in the route function.

it contains the following: 
const {
        generateBEToken,
        generateUserToken,
        logger,
        csClient,
        storageClient
} = nexmo;

- generateBEToken, generateUserToken,// those methods can generate a valid token for application
- csClient: this is just a wrapper on https://github.com/axios/axios who is already authenticated as a nexmo application and 
    is gonna already log any request/response you do on conversation api. 
    Here is the api spec: https://jurgob.github.io/conversation-service-docs/#/openapiuiv3
- logger: this is an integrated logger, basically a bunyan instance
- storageClient: this is a simple key/value inmemory-storage client based on redis

*/



/** 
 * 
 * This function is meant to handle all the asyncronus event you are gonna receive from conversation api 
 * 
 * it has 2 parameters, event and nexmo context
 * @param {object} event - this is a conversation api event. Find the list of the event here: https://jurgob.github.io/conversation-service-docs/#/customv3
 * @param {object} nexmo - see the context section above
 * */
//  const axios = require("axios");

 //YOUR CONFIG
 const DATACENTER = `https://api.nexmo.com` 
 const USERNAME="testagent"
 const TIMEOUT = 8 //in seconds
 //END YOUR CONFIG
 
 const waitingForConnection = {}

 const execTransfer = (leg_id, logger,csClient) => {
  logger.info({ leg_id }, "execTransfer : sending transfer request")
  // look the documentation at: https://developer.vonage.com/api/voice under the `Modify an in progress call` section
  return csClient({
      url: `${DATACENTER}/v1/calls/${leg_id}`,
      method: 'put',
      data : {
          "action": "transfer",
          "destination": {
            "type": "ncco",
            "ncco": [
              {
               "action": "talk",
               "text": `agent unavaliable, we are gonna transfer you`
              },
              {
                "action": "stream",
                "streamUrl": [
                  "https://static.dev.nexmoinc.net/svc/ncco/audio_files/wav/counting.wav"
                ]
              },
              {
                "action": "record",
                "endOnSilence": 3,
                "endOnKey": "#",
                "beepOnStart": 1
              }
            ]
          }
        }
    }).then(({ status, statusText }) => {
      logger.info({ status, statusText }, "Request Logger execTransfer (axios response) ")
      return;
    }).catch(error => logger.error({ error }, "Request Logger execTransfer error ")
    )
}
 
 const voiceEvent = async (req, res, next) => {
     const { logger, csClient } = req.nexmo;
     logger.info("voiceEvent", { req_body   : req.body})
 
     const { to, status } = req.body
 
     try { 
         //CANCEL TRANSFER if the agent respond within the timeout
         if(waitingForConnection[to] && status === "answered") {
             clearTimeout(waitingForConnection[to]);
             delete waitingForConnection[to];
         }
         res.json({})
 
     } catch (err) {
         
         logger.error("Error on voiceEvent function")
     }
     
 }
 
 
 
 
 
 
 const voiceAnswer = async (req, res, next) => {
     const { logger, generateBEToken, csClient } = req.nexmo;
     logger.info("voiceAnswer", { req_body   : req.body})
 
     const { uuid } = req.body;
 
     try {
         const timeout = TIMEOUT
         const userName = USERNAME
         
         //IF THE CUSTOMER IS NOT GONNA RESPOND IN TIMEOUT SECONDS, TRANSFER THE CALL
         const myTimeout = setTimeout(
           () => execTransfer(uuid, logger,csClient), 
           timeout * 1000
         );
         
         waitingForConnection[userName] = myTimeout
         
        //CONNECT THE INBOUND CALL TO THE AGENT
         return res.json([
            {
              "action": "talk",
              "text": `waiting for your agent`
            },
             {
                 "action": "connect",
                 "timeout": timeout,
                 "eventType": "synchronous",
                 "endpoint": [
                    { 
                      "type": "app", 
                      "user": `${userName}` 
                    }
                 ]
             }
         ])

 
     } catch (err) {
         logger.error({err}, "Error on voiceAnswer function")
     }
 
 }
 
 const route = (app, express) => {

  app.post("/api/subscribe", async (req, res) => {
    const {
      generateBEToken,
      generateUserToken,
      logger,
      csClient,
      storageClient,
    } = req.nexmo;

    try {
      const { name } = req.body;
      const resNewUser = await csClient({
        url: `${DATACENTER}/v0.3/users`,
        method: "post",
        data: {
          name,
        },
      });

      await storageClient.set(`user:${name}`, resNewUser.data.id);
      const storageUser = await storageClient.get(`user:${name}`);

      return res.json({ name, resNewUser: resNewUser.data, storageUser });
    } catch (err) {
      console.log("error", err);
      logger.error({ err }, "ERROR");
      throw err;
    }
  });

  app.get("/api/infos", async (req, res) => {
    const {
      config,
    } = req.nexmo;

    res.json({
      desc: "this is an info endpoint to give current infos about the app",
      endpoints: [
        {
          desc: "create a new agent",
          url: `${config.server_url}/api/subscribe`,
          method: "POST",
          data: `{ "name": "${USERNAME}"  }`
        }
      ]
    })
  })


 }

 module.exports = {
     voiceEvent,
     voiceAnswer,
     route
 }