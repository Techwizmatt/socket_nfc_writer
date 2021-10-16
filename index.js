const path = require('path')
const { NFC } = require('nfc-pcsc')
const nfc = new NFC()
const ndef = require('@taptrack/ndef')
const libNfc = require(path.join(process.cwd(), '/libraries/nfc'))

const cors = require('cors')
const express = require('express')
const app = express()
const http = require('http')

app.use(cors({
    methods: ['GET','POST','DELETE','UPDATE','PUT','PATCH'],
    origin: '*',
    optionsSuccessStatus: 200
}))

app.get('/', (req, res) => {
    res.send(200)
})

const server = http.createServer(app)
const { Server } = require("socket.io")
const io = new Server(server,{
    allowEIO3: true,
    cors: {
        origin: 'http://192.168.1.2:8080',
        methods: ["GET", "POST"],
        credentials: true
    }
})

const queue = {
    current: {
        id: null,
        url: null
    },
    history: []
}


nfc.on('reader', reader => {
    reader.aid = 'F222222222'

    reader.on('card', async card => {
        io.emit('tagConnected', card)
        if (queue.current.url === null) {
            console.log('Nothing to write')
        } else {
            try {
                const textRecord = ndef.Utils.createUriRecord(queue.current.url)
                const message = new ndef.Message([textRecord])
                const bytes = message.toByteArray()
                // convert the Uint8Array into to the Buffer and encapsulate it
                const data = libNfc.encapsulate(Buffer.from(bytes.buffer))

                // data is instance of Buffer containing encapsulated NDEF message
                await reader.write(4, data)

                console.log(`Wrote from queue: ${queue.current.url}`)
                io.to(queue.current.id).emit('writeSuccess', queue.current.url)
            } catch (error) {
                io.to(queue.current.id).emit('writeFailed', error)
                console.error(error)
            } finally {
                queue.history.push(queue.current)
                queue.current = {
                    id: null,
                    url: null
                }
            }
        }
    })

    reader.on('card.off', card => {
        io.emit('tagRemoved', card)
    });

    reader.on('error', err => {
        io.emit('tagError', err)
    });
})

io.on('connection', (socket) => {
    socket.on('nfc_write_url', async (url) => {
        console.log(`Received request for ${url}`)
        queue.current = {
            id: socket.id,
            url: url
        }
    })
})

server.listen(3000, () => {
    console.log('Listening on 3000')
})
