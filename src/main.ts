import * as core from '@actions/core'
import FormData from 'form-data'
import {createReadStream} from 'fs'
import fetch from 'node-fetch'
import walkSync from 'walk-sync'

async function postFile({
  channel,
  file,
  token,
  type
}: {
  type: 'file' | 'image'
  channel: string
  file: string
  token: string
}): Promise<unknown> {
  const formData = new FormData()
  formData.append('recipient', JSON.stringify({thread_key: channel}))
  formData.append(
    'message',
    JSON.stringify({
      attachment: {type, payload: {is_reusable: false}}
    })
  )
  formData.append('filedata', createReadStream(file))

  const resp = await fetch(
    `https://graph.facebook.com/v11.0/me/messages?access_token=${token}`,
    {
      method: 'POST',
      body: formData,
      headers: {
        accept: 'application/json'
      }
    }
  )
  const json = await resp.json()
  return json
}

async function run(): Promise<void> {
  try {
    core.debug('INIT!')
    const token = core.getInput('token')
    const channel = core.getInput('channel')
    const workdir = core.getInput('workdir') || 'cypress'
    const messageText =
      core.getInput('message-text') ||
      "A Cypress test just finished. I've placed the screenshots and videos in this thread. Good pie!"

    core.debug(`Token: ${token}`)
    core.debug(`Channels: ${channel}`)
    core.debug(`Message text: ${messageText}`)

    core.debug('Checking for videos and/or screenshots from cypress')
    const videos = walkSync(workdir, {globs: ['**/*.mp4']})
    const screenshots = walkSync(workdir, {globs: ['**/*.png']})

    if (videos.length <= 0 && screenshots.length <= 0) {
      core.debug('No videos or screenshots found. Exiting!')
      core.setOutput('result', 'No videos or screenshots found!')
      return
    }

    core.debug(
      `Found ${videos.length} videos and ${screenshots.length} screenshots`
    )

    core.debug('Sending initial slack message')

    const resp = await fetch(
      `https://graph.facebook.com/v11.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_type: 'UPDATE',
          recipient: {thread_key: channel},
          message: {
            text: "I've got test results coming in from Cypress. Hold tight ..."
          }
        }),
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json'
        }
      }
    )
    await resp.json()

    if (screenshots.length > 0) {
      core.debug('Uploading screenshots...')

      await Promise.all(
        screenshots.map(async screenshot => {
          core.debug(`Uploading ${screenshot}`)
          return postFile({
            channel,
            file: `${workdir}/${screenshot}`,
            token,
            type: 'image'
          })
        })
      )

      core.debug('...done!')
    }

    if (videos.length > 0) {
      core.debug('Uploading videos...')

      await Promise.all(
        videos.map(async video => {
          core.debug(`Uploading ${video}`)
          return postFile({
            channel,
            file: `${workdir}/${video}`,
            token,
            type: 'file'
          })
        })
      )

      core.debug('...done!')
    }
  } catch (error: unknown) {
    core.setFailed(typeof error === 'string' ? error : (error as Error).message)
  }
}

run()
