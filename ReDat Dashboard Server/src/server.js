const http = require('http')
var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
const qs = require('querystring')
const url = require('url')
const RedditData = require('./src/redditData.repo');

const port = 3031;


const server = http.createServer((req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
    if (req.method === 'GET') {
        return handleGetReq(req, res)
    } else if (req.method === 'POST') {
        return handlePostReq(req, res)
    } else if (req.method === 'DELETE') {
        return handleDeleteReq(req, res)
    } else if (req.method === 'PUT') {
        return handlePutReq(req, res)
    } else if (req.method === 'OPTIONS') {
        return res.end('OPTIONS')
    }
})

/////////// TEST FUNCTION CALL ONLY WITH AWAIT (ASYNC)


// GET
async function handleGetReq(req, res) {
    const { pathname, query } = url.parse(req.url)

    if (pathname !== '/all/your/communities' && pathname !== '/my-communities' && pathname !== '/admin/subscribed/at/community' && pathname !== '/selected/your/communities' && pathname !== '/selected/your/subjects' && pathname !== '/search/communities') {
        return handleError(res, 404)
    }

    let { id, redditToken, filterType, toShow, searchInput, communityName } = qs.parse(query);
    const userId = id.split('_')[0];

    if (!id) {
        throw { statusCode: 404, message: 'User not found!' }
    }


    try {

        var posts = [];
        var responsePosts = [];
        var responseCommunities = [];
        const localDbCommunities = await RedditData.getCommunitiesByUser(userId);

        switch (pathname) {
            case '/my-communities':
                res.write(JSON.stringify(localDbCommunities));
                break;
            case '/all/your/communities':
                if (!redditToken || !filterType || !id) {
                    throw { statusCode: 400, message: 'Invalid request' }
                }
                for (i = 0; i < localDbCommunities.length; i++) {
                    const getCommunitiesRes = await RedditData.getCommunityPosts(filterType, redditToken, localDbCommunities[i].community_name);
                    posts = posts.concat(getCommunitiesRes);
                }
                break;
            case '/selected/your/communities':
                if (!redditToken || !filterType || !id || !toShow) {
                    throw { statusCode: 400, message: 'Invalid request' }
                }
                var communitiesToShow = toShow.replace(/[\[\]\"]/g, "");
                communitiesToShow = communitiesToShow.split(",");
                for (i = 0; i < communitiesToShow.length; i++) {
                    const getCommunitiesRes = await RedditData.getCommunityPosts(filterType, redditToken, communitiesToShow[i]);
                    posts = posts.concat(getCommunitiesRes);
                }
                break;
            case '/selected/your/subjects':
                if (!redditToken || !filterType || !id || !toShow) {
                    throw { statusCode: 400, message: 'Invalid request' }
                }
                var subjectsToShow = toShow.replace(/[\[\]\"]/g, "");
                subjectsToShow = subjectsToShow.split(",");
                for (i = 0; i < subjectsToShow.length; i++) {
                    const getSubjectsRes = await RedditData.getSubjectPosts(filterType, redditToken, subjectsToShow[i]);
                    posts = posts.concat(getSubjectsRes);
                }
                break;

            case '/search/communities':
                if (!redditToken || !searchInput || !id) {
                    throw { statusCode: 400, message: 'Invalid request' }
                }

                const communitiesReddit = await RedditData.getCommunitiesByName(redditToken, searchInput);

                communitiesReddit.forEach(community => {
                    responseCommunities = responseCommunities.concat({ name: community.data.display_name, title: community.data.title, icon: community.data.icon_img, subscribers: community.data.subscribers, description: community.data.public_description, submit_text: community.data.submit_text });
                })

                res.write(JSON.stringify(responseCommunities));
                break;

            case '/admin/subscribed/at/community':
                if (!redditToken || !communityName) {
                    throw { statusCode: 400, message: 'Invalid request' }
                }

                let subscribedCommunities = await RedditData.getSubscribedCommunities(redditToken);
                let subscribedCommunitiesNames = [];
                subscribedCommunities.forEach(community => {
                    subscribedCommunitiesNames = subscribedCommunitiesNames.concat(community.data.display_name);
                })
                if (subscribedCommunitiesNames.includes(communityName)) {
                    res.write(JSON.stringify({ message: "Already subscribed" }));
                } else {
                    res.write(JSON.stringify({ message: "Not subscribed" }));
                }
                break;
        }

        if (pathname !== "/my-communities" && pathname !== '/search/communities' && pathname !== '/admin/subscribed/at/community') {
            if (posts && posts.length) {
                posts.forEach(post => {
                    responsePosts = responsePosts.concat({ community: post.data.subreddit, author: post.data.author, title: post.data.title, content: post.data.selftext, createdAt: post.data.created_utc, score: post.data.score })
                })
            }
            res.write(JSON.stringify(responsePosts));
        }
        res.statusCode = 200;
        return res.end();

    } catch (err) {
        res.statusCode = err.statusCode;
        res.end(JSON.stringify({ message: err.message }));

    }




}

// POST 
async function handlePostReq(req, res) {
    /// REGISTER
    const size = parseInt(req.headers['content-length'], 10)
    const buffer = Buffer.allocUnsafe(size)
    var pos = 0

    const { pathname } = url.parse(req.url)
    if (pathname !== '/remove/community' && pathname !== '/subscribe/admin/at/community') {
        return handleError(res, 404)
    }

    req
        .on('data', (chunk) => {
            const offset = pos + chunk.length
            if (offset > size) {
                reject(413, 'Too Large', res)
                return
            }
            chunk.copy(buffer, pos)
            pos = offset
        })
        .on('end', async() => {
            if (pos !== size) {
                reject(400, 'Bad Request', res)
                return
            }
            const data = JSON.parse(buffer.toString())


            try {
                switch (pathname) {
                    case '/remove/community':
                        const userId = data.id.split('_')[0];
                        let responseRemoved = await RedditData.removeCommunityForUser(userId, data.community);
                        if (responseRemoved) {
                            res.setHeader('Content-Type', '*/*');
                            res.statusCode = 200;
                            res.end(JSON.stringify({ removingMessage: "Community removed successfully" }));
                        } else {
                            throw { statusCode: 500, message: 'Internal server error' };
                        }
                        break;

                    case '/subscribe/admin/at/community':
                        console.log(data.redditToken);
                        let responseSubscription = await RedditData.subscribeAdminAtCommunity(data.redditToken, data.community);
                        console.log("ies din functie");
                        console.log(responseSubscription);
                        if (responseSubscription) {
                            res.setHeader('Content-Type', '*/*');
                            res.statusCode = 200;
                            res.end(JSON.stringify({ message: "Subscription was successfully made!" }));
                        } else {
                            console.log("asa e")
                            throw { statusCode: 500, message: 'Internal server error' };
                        }
                        break;

                }


            } catch (err) {
                if (!Object.keys(http.STATUS_CODES).includes(err.statusCode)) {
                    res.setHeader('Content-Type', '*/*');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ message: 'Internal server error' }));
                } else {
                    res.setHeader('Content-Type', '*/*');
                    res.statusCode = err.statusCode;
                    res.end(JSON.stringify(err.message));
                }
            }
        })
}

// DELETE
function handleDeleteReq(req, res) {
    const { pathname, query } = url.parse(req.url)
    if (pathname !== '/user') {
        return handleError(res, 404)
    }
    const { id } = qs.parse(query)
        // const userDeleted = Users.deleteUser(id);
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    res.end(`{"userDeleted": ${id}}`)
}

// PUT
function handlePutReq(req, res) {
    // LOGIN
    const { pathname, query } = url.parse(req.url)
    if (pathname !== '/user') {
        return handleError(res, 404)
    }
    const { id } = qs.parse(query)
    const size = parseInt(req.headers['content-length'], 10)
    const buffer = Buffer.allocUnsafe(size)
    var pos = 0
    req
        .on('data', (chunk) => {
            const offset = pos + chunk.length
            if (offset > size) {
                reject(413, 'Too Large', res)
                return
            }
            chunk.copy(buffer, pos)
            pos = offset
        })
        .on('end', async() => {
            if (pos !== size) {
                reject(400, 'Bad Request', res)
                return
            }

            res.end()
        })
}

function handleError(res, code) {
    res.statusCode = code
    res.end(`{"error": "${http.STATUS_CODES[code]}"}`)
    return;
}

server.listen(port, () => {
    console.log(`Server listening on port ${port}`)
});