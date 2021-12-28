import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
import { verifyJwt } from "lit-jwt-verifier";

/**
 * The DEBUG flag will do two things that help during development:
 * 1. we will skip caching on the edge, which makes it easier to
 *    debug.
 * 2. we will return an error message on exception in your Response rather
 *    than the default 404.html page.
 */
const DEBUG = false

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 500,
        }),
      )
    }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {

  const url = new URL(event.request.url)
  const path = url.pathname;

  let options = {}
  
  /**
   * You can add custom logic to how we fetch your assets
   * by configuring the function `mapRequestToAsset`
   */
  // options.mapRequestToAsset = handlePrefix(/^\/docs/)
  

  try {
    if (DEBUG) {
      // customize caching
      options.cacheControl = {
        bypassCache: true,
      };
    }

    // =================================================
    // Path ./api/video_id
    // =================================================
    if((path.match(/\/api\/video_id$/) || [])[0] === path){
      // -- prepare
      const method = event.request['method'];

      const _header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };

      // -------------------
      // GET Request Handler
      // -------------------
      if(method == 'GET'){

        // -- prepare JWT
        console.log(`request url==> ${url}`);
        let jwt;

        // -- check if JWT token exists
        try {
          const { searchParams } = new URL(url)
          jwt = searchParams.get('jwt')
          console.log('jwt==>', jwt)
        } catch (e) {
          console.log(e)
          return new Response('no jwt', { status: 400 })
        }

        // -- check JWT
        try{
          const { payload, header, signature, verified } = await verifyJwt({ jwt });
          const _WHITE_LIST = WHITE_LIST.replaceAll(' ', '').split(',');

          // -- if it's NOT legit
          if(!verified || !_WHITE_LIST.includes(payload.baseUrl) || payload.orgId !== '' || payload.role !== '' || payload.extraData !== ''){
            // -- Exception:: Unauthorized
            return new Response('Unauthorized', {
              headers: { 'content-type': 'text/plain' },
              status: 401,
            })
          }

          // -- if it's legit, get signed url
          const videoID = payload.path.split('/')[1];
          const signedVideoId = await getSignedUrl(videoID);
          
          // -- compile data

          return new Response(JSON.stringify(signedVideoId), _header);


        }catch (e) {
          console.log('error')
          console.log(JSON.stringify(e, ['message', 'arguments', 'type', 'name']))
          console.log(e.stack)
        }

        // -- Exception:: Unauthorized
        return new Response('Unauthorized', {
          headers: { 'content-type': 'text/plain' },
          status: 401,
        })

        // const jsonData = JSON.stringify(result['result']['uploadURL']);
        // const jsonData = 'http://127.0.0.1:8787/api/video_id';

        // return new Response(jsonData, header);
      }
    }
    // =================================================
    // Path ./api/get_direct_upload_auth
    // =================================================
    if((path.match(/\/api\/get_direct_upload_auth$/) || [])[0] === path){

      // -- prepare
      const method = event.request['method'];

      const header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };

      // -------------------
      // GET Request Handler
      // -------------------
      if(method == 'GET'){

        // -- prepare
        const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`;
        
        const options = {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Auth-Email': CF_EMAIL,
              'X-Auth-Key': CF_GLOBAL_API,
          },
          body: JSON.stringify({
              maxDurationSeconds: 300, // 5 mins
              requireSignedURLs: true,
          })
        };

        // -- execute
        const res = await fetch(url, options);
        const result = await res.json();

        const jsonData = JSON.stringify(result['result']['uploadURL']);

        return new Response(jsonData, header);
      }

      // ---------------------
      // POST Requests Handler 
      // ---------------------
      if(method == 'POST'){
        return new Response("Testing", header);
      }


    }

    // =================================================
    // Path ./wallet/{walletAddress}
    // =================================================
    if((path.match(/\/wallet\/.+$/) || [])[0] === path){

      // -- prepare
      const walletAddress = path.split('/')[2];
      const method = event.request['method'];
      const credential = await LIT_KV.get(walletAddress);
      
      const header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };

      // -------------------
      // GET Request Handler
      // -------------------
      if(method == 'GET'){
        const jsonData = JSON.stringify({
          method: event.request['method'],
          walletAddress: walletAddress,
          kv: credential, 
        }, null, 2)

        return new Response(jsonData, header);
      }

      // ---------------------
      // POST Requests Handler 
      // ---------------------
      if(method == 'POST'){
        
        // If there record for this wallet address
        if(credential != null){
          const jsonData = JSON.stringify({
            error: "Wallet Exist",
          });
          return new Response(jsonData, header);
        }

        // If no record was found for this wallet address
        const encryptedCredential = await event.request.url.split('?c=')[1];

        // If the size of the data is less than 1000 characters
        if(encryptedCredential.length < 1000){
          const jsonData = JSON.stringify({
            error: "requirements not met.",
          }, null, 2);
  
          return new Response(jsonData, header);
        }

        // insert new entry to db
        await LIT_KV.put(walletAddress, encryptedCredential);

        const jsonData = JSON.stringify({
          method: event.request['method'],
          walletAddress: walletAddress,
          kv: encryptedCredential,
        }, null, 2);

        return new Response(jsonData, header);

      }
    }

    // =================================================
    // Path ./api/new_video
    // =================================================
    if((path.match(/\/api\/new_video$/) || [])[0] === path){
      
      // -- prepare
      const method = event.request['method'];

      const header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };
      
      // -------------------
      // GET Request Handler
      // -------------------
      if(method == 'GET'){

        const jsonData = JSON.stringify({
          path: "./newvideo"
        });

        return new Response(jsonData, header);
      }

      // ---------------------
      // POST Requests Handler 
      // ---------------------
      if(method == 'POST'){
        
        const json = await event.request.json();

        await VIDEOS.put(json.id, json.value);

        const jsonData = JSON.stringify({
          id: json.id,
          value: json.value,
        }, null, 2)

        return new Response(jsonData, header);
      }
    }

    // =================================================
    // Path ./api/videos
    // =================================================
    if((path.match(/\/api\/videos$/) || [])[0] === path){
      
      // -- prepare
      
      const method = event.request['method'];

      const header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };
      
      // -------------------
      // GET Request Handler
      // Return a list of videos from VIDEOS namespace
      // -------------------
      if(method == 'GET'){

        const value = await VIDEOS.list();
        const jsonData = JSON.stringify(value.keys);

        return new Response(jsonData, header);
      }

      // ---------------------
      // POST Requests Handler 
      // ---------------------
      if(method == 'POST'){
        
        const json = await event.request.json();
        
        // -- received data
        // const accountId = json.accountId;
        // const namespaceId = json.namespaceId;
        const key = json.key;

        // // -- prepare params
        // const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

        // const options = {
        //     method: 'GET',
        //     headers: {
        //         'Content-Type': 'application/json',
        //         'X-Auth-Email': 'lightanson@protonmail.com',
        //         'X-Auth-Key': '9e71cdc773da780e5059efe41ee0887d86b08',
        //     },
        // };

        const data = await VIDEOS.get(key);

        const jsonData = JSON.stringify({
          url,
          data
        }, null, 2)

        return new Response(jsonData, header);
      }
    }
    
    
    // =================================================
    // Path ./account
    // =================================================
    if((path.match(/\/account$/) || [])[0] === path){

      const json = await event.request.json();
      const method = event.request['method'];

      const header = {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
          "Access-Control-Max-Age": "86400",
        }
      };
      
      // -------------------
      // GET Request Handler
      // -------------------
      if(method == 'GET'){
        const jsonData = JSON.stringify({
          data: "Hello, Moto.",
        });
  
        return new Response(jsonData, header);
      }

      // ---------------------
      // POST Requests Handler 
      // ---------------------
      if(method == 'POST'){

        // -- prepare params
        const url = `https://api.cloudflare.com/client/v4/accounts`;
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Email': json.email,
                'X-Auth-Key': json.globalAPI,
            },
        };

        const res = await fetch(url, options);
        const result = await res.json();

        const jsonData = JSON.stringify({
          id: result['result'][0]['id']
        }, null, 2)

        return new Response(jsonData, header);
      }
      

    }
    

    const page = await getAssetFromKV(event, options);

    // allow headers to be altered
    const response = new Response(page.body, page);

    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "unsafe-url");
    response.headers.set("Feature-Policy", "none");

    return response;

  } catch (e) {
    // https://stackoverflow.com/a/58439234
    // Fall back to serving `/index.html` on errors.
    return getAssetFromKV(event, {
      mapRequestToAsset: req => new Request(`${new URL(req.url).origin}/index.html`, req),
    })
  }
}

//
// (POST) Request a signed video url
// accounts/:account_identifier/stream/direct_upload
// @returns { String } uploadURL
//
export const getSignedUrl = async (VIDEO_ID) => {
  
  console.log("====== VIDEO_ID ======: ", VIDEO_ID);

  // -- prepare
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${VIDEO_ID}/token`;

  console.log(url);
  var signed_url_restrictions = {
    //limit viewing for the next 2 hours
    exp: Math.floor(Date.now() / 1000) + (12*60*60),
  };
  
  const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Auth-Email': CF_EMAIL,
        'X-Auth-Key': CF_GLOBAL_API,
    },
    body: JSON.stringify(signed_url_restrictions)
  };

  // -- execute
  const res = await fetch(url, options);
  const result = await res.json();
  const token = result.result.token;
  console.log("TOKEN!!!");
  console.log(token);

  return token;
}