const express = require('express')
const shortid = require('shortid')

const urlModel = require('../models/urlModel')

const redis = require("redis");

const { promisify } = require("util");

//Connect to redis
const redisClient = redis.createClient(
    10705
    ,
    "redis-10705.c264.ap-south-1-1.ec2.cloud.redislabs.com",
    { no_ready_check: true }
);
redisClient.auth("tReI1amcKK0ikMdjitLlZP3JZf6x8mE0", function (err) {
    if (err) throw err;
});

redisClient.on("connect", async function () {
    console.log("Connected to Redis..");
});



const SET_ASYNC = promisify(redisClient.SET).bind(redisClient);
const GET_ASYNC = promisify(redisClient.GET).bind(redisClient);


const isValidRequestBody = function (value) {
    if (typeof (value) == 'undefined' || value == null) return false
    if (typeof (value) == 'string' && value.trim().length == 0) return false
    return true
}

/************************************************************CREATE URL******************************************************************** */
const createUrl = async function (req, res) {

    try {

        const data = req.body

        // The API base Url endpoint
        const baseUrl = 'http://localhost:3000'

        if (Object.keys(data).length != 1) {
            return res.status(400).send({ status: false, message: "Invalid request body" })
        }

        //if no input inside long url
        if (!isValidRequestBody) return res.status(400).send({ status: false, message: "No input inside long url" })

        //check if longUrl not present in requestBody
        const longUrl = data.longUrl
        if (!longUrl) return res.status(400).send({ status: false, message: "longUrl must be present" })

        //check valid url
        let validLongUrl = (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%.\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%\+.~#?&//=]*)/.test(longUrl.trim()))
        if (!validLongUrl) {
            return res.status(400).send({ status: false, msg: "Please provide a valid longUrl" })
        }


        //Ensuring the same response is returned for an original url everytime
        let cachedLongUrl = await GET_ASYNC(`${longUrl}`)
        //console.log(cachedLongUrl);
        if (cachedLongUrl) { return res.send(JSON.parse(cachedLongUrl)) }
        else {
            let url = await urlModel.findOne({ longUrl: longUrl }).select({ urlCode: 1, shortUrl: 1, longUrl: 1, _id: 0 })
            if (url) {
                await SET_ASYNC(`${longUrl}`, JSON.stringify(url))
                return res.send({ data: url });
            }
        }

        // if longUrl valid, we create the url code
        const urlCode = shortid.generate()

        //if urlCode already exist
        const isAlreadyUrlCode = await urlModel.findOne({ urlCode: urlCode })
        if (isAlreadyUrlCode) {
            urlCode = shortid.generate()
        }

        // join the generated short code the the base url
        const shortUrl = baseUrl + '/' + urlCode

        //create key-value pair in object data
        data.shortUrl = shortUrl.toLowerCase()
        data.urlCode = urlCode.toLowerCase()

        const urlCreated = await urlModel.create(data)
        return res.status(201).send({ status: true, message: "url generated", data: { urlCode: urlCreated.urlCode, shortUrl: urlCreated.shortUrl, longUrl: urlCreated.longUrl } })
    }

    catch (error) {
        return res.status(500).send({ status: false, error: error.message })
    }

}


//***************************************************************GET URL********************************************************************************************************************

const getUrl = async function (req, res) {

    try {
        const urlCode = req.params.urlCode

        //check if no urlCode is present in path params
        if (!urlCode) return res.status(400).send({ status: false, message: "urlCode must be present" })


        ///we have already set this document in cache from which we will get here so no need to set in cache again
        let cachedurlCode = await GET_ASYNC(`${urlCode}`)
        if (cachedurlCode) {
            return res.redirect(JSON.parse(cachedurlCode).longUrl)
        } ///JSON.parse convert string into object

        const findUrlCode = await urlModel.findOne({ urlCode: urlCode })

        //check if the urlCode is present in path params does not matches with one in db
        if (!findUrlCode) return res.status(404).send({ status: false, message: "Unable to find URL to redirect to" })
        return res.status(302).redirect(findUrlCode.longUrl)
    }

    catch (error) {
        return res.status(500).send({ status: false, error: error.message })
    }
}

module.exports = { createUrl, getUrl }
