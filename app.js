const express = require('express')
const bodyParser = require('body-parser')
const {HttpClient} = require('@actions/http-client')
const {ErrorHandler, BadRequestError} = require('express-json-api-error-handler')

const createComment = async (http, params) => {
  const {repoToken, owner, repo, issueNumber, body} = params

  return http.postJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {body},
    {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${repoToken}`,
    }
  )
}

const checkToken = async (http, token) => {
  if (!token) {
    return false
  }

  if (token === process.env.GITHUB_TOKEN) {
    // Assume the use of this token is intentional
    return true
  }

  try {
    await http.getJson(`https://api.github.com/user/repos`, {
      accept: 'application/vnd.github.v3+json',
      authorization: `token ${token}`,
    })
    return false
  } catch (err) {
    // Far from perfect, temporary tokens are difficult to identify
    // A bad token returns 401, and a personal token returns 200
    return (
      err.statusCode === 403 &&
      err.result.message &&
      err.result.message.startsWith('Resource not accessible by integration')
    )
  }
}

const app = express()

app.use((req, res, next) => {
  req.httpClient = new HttpClient('http-client-add-pr-comment-bot')
  next()
})
app.use(bodyParser.json())

app.get('/test', async (req, res) => {
  res.status(200).send('hello')
})

app.post('/repos/:owner/:repo/issues/:issueNumber/comments', async (req, res, next) => {
  try {
    const isTokenValid = await checkToken(req.httpClient, req.header('temporary-github-token'))
    if (!isTokenValid) {
      throw new BadRequestError('must provide a valid temporary github token')
    }

    const response = await createComment(req.httpClient, {
      ...req.params,
      ...req.body,
      repoToken: process.env.GITHUB_TOKEN,
    })

    res.status(200).send(response).end()
  } catch (err) {
    next(err)
  }
})

// Must use last
const errorHandler = new ErrorHandler()
errorHandler.setErrorEventHandler(err => console.log(JSON.stringify(err)))
app.use(errorHandler.handle)

app.listen(process.env.PORT || 3000)
