import { useState, useEffect, useCallback } from 'react';
import { CordProvider, PagePresence, Thread } from '@cord-sdk/react';
import './App.css';

function App() {
  const [cordToken, userID] = useCordToken();

  const slackChannels = useSlackChannels();
  const slackClientID = useGetSlackClientID();

  const [ready, setReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState(' ');

  const [showSlackConnectModal, setShowSlackConnectModal] = useState(false);
  const [showSlackShareModal, setShowSlackShareModal] = useState(false);
  const [selectedSlackChannel, setSelectedSlackChannel] = useState<
    string | null
  >(slackChannels?.[0]?.id ?? null);

  useEffect(() => {
    if (slackChannels?.[0]) {
      setSelectedSlackChannel(slackChannels[0].id);
    }
  }, [slackChannels]);

  const shareThreadToSlack = useCallback(
    (threadID: string) => {
      fetch('https://localhost:3001/shareToSlack', {
        method: 'POST',
        body: JSON.stringify({
          threadID,
          channel: selectedSlackChannel,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then((res) => {
          if (res.ok) {
            setStatusMessage('Success!');
          } else {
            throw new Error();
          }
        })
        .catch(() => setStatusMessage('Something went wrong 😱'));
    },
    [selectedSlackChannel],
  );

  useEffect(() => {
    if (statusMessage !== ' ') {
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [statusMessage]);

  if (!cordToken) {
    return <p> Loading ... </p>;
  }

  // You can of course have multiple threads on Cord, but this demo app keeps it
  // simple and just uses one.  Rename this variable to get a 'fresh' thread to
  // play with.
  const threadID = 'my-home-thread';

  return (
    <div className="App">
      {!ready && <div>Loading...</div>}
      <div style={{ display: ready ? 'block' : 'none' }}>
        <CordProvider
          clientAuthToken={cordToken}
          // Disable the default Cord slackbot feature, since you are integrating
          // your own!
          enableSlack={false}
          onInitError={(err) =>
            console.error('Error initializing Cord' + err.message)
          }
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'fixed',
              left: 0,
              top: 0,
              width: '100%',
              padding: '16px',
              backgroundColor: '#646cff',
              zIndex: 1,
            }}
          >
            <button
              style={{
                display: slackChannels ? 'none' : 'flex',
                alignItems: 'center',
                backgroundColor: '#eeeeee',
                color: '#000000',
                padding: 0,
                paddingRight: '8px',
              }}
              onClick={() => setShowSlackConnectModal(true)}
            >
              <img src="./src/assets/slack.svg" style={{ height: '36px' }} />
              <span>Add Slack integration</span>
            </button>
            <button
              style={{
                display: slackChannels ? 'inline' : 'none',
                backgroundColor: '#eeeeee',
                color: '#000000',
              }}
              onClick={async () => {
                await fetch('https://localhost:3001/removeSlackIntegration', {
                  method: 'POST',
                });
                location.reload();
              }}
            >
              Remove Slack integration
            </button>
            <div style={{ display: 'flex', position: 'fixed', right: 16 }}>
              <span
                style={{
                  marginRight: '8px',
                  color: '#ffffff',
                  fontWeight: '600',
                }}
              >
                Visitors:{' '}
              </span>
              <PagePresence className="pagePresence" excludeViewer={false} />
            </div>
          </div>
          <p style={{ minHeight: '24px' }}>{statusMessage}</p>
          <section style={{ maxWidth: '600px' }}>
            <h1>My SaaS Tool</h1>
            {/* Simple/hacky assumption: if no Slack channels are available from the backend, noone has connected Slack yet */}
            {!slackChannels && (
              <div
                className="addSlackButton"
                style={{ display: 'flex', justifyContent: 'center' }}
              ></div>
            )}
            <p>
              Welcome to this simple app which demonstrates how you can
              integrate your own Slack app with Cord
            </p>
            <img
              src="https://img.freepik.com/free-vector/isometric-cms-concept_23-2148807389.jpg"
              style={{ height: '250px' }}
            ></img>
            <p>
              Every time you refresh the page you will log in to Cord with a
              different sample user, which have been prepared for you in
              /data/users.json. You can see which user you currently are by
              looking at the 'Facepile' at the top right of this page.
            </p>
            <h3>Recent user thoughts:</h3>
            <Thread
              threadId={threadID}
              onRender={() => setReady(true)}
              style={{ width: '400px', maxHeight: '600px', margin: 'auto' }}
            />
            {slackChannels && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  style={{
                    display: 'flex',
                    margin: '16px',
                    alignItems: 'center',
                  }}
                  onClick={() => setShowSlackShareModal(true)}
                >
                  <img
                    src="./src/assets/slack.svg"
                    style={{ height: '32px' }}
                  />
                  Share this conversation to Slack!
                </button>
              </div>
            )}
            <p>
              If you've connected to your Slack app you should now receive Slack
              notifications from your app when another Cord user (i.e. not the
              one you were logged in as when you connected) messages on the
              thread.
            </p>
            <p>
              You should also now be able to share the entire thread to a Slack
              channel of your choice, by clicking the button above. After
              sharing, any subsequent messages left in the thread on Slack
              should magically appear back here in the browser. And any
              subsequent messages you leave here should also get sent to Slack!
              We call this 'mirroring' a thread with Slack.
            </p>
          </section>
        </CordProvider>
        {(showSlackConnectModal || showSlackShareModal) && (
          <div
            style={{
              display: 'flex',
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100%',
              width: '100%',
              backgroundColor: '#00000066',
            }}
          >
            <div
              style={{
                background: 'white',
                margin: 'auto',
                padding: '40px',
                maxWidth: '50%',
              }}
            >
              {showSlackConnectModal && (
                <>
                  <div>
                    <p>
                      Integrate Slack app as user <strong>{userID}</strong>?
                      This means that when another user leaves a message that is
                      relevant to <strong>{userID}</strong>, you will get
                      notified by your bot on Slack
                    </p>
                    <p>
                      The way this app is set up, if other users in
                      /data/users.json have email addresses which match email
                      addresses of other users in your Slack workspace, they
                      will be associated and receive their notifications on
                      Slack
                    </p>
                  </div>
                  <div
                    style={{
                      marginTop: '24px',
                      display: 'flex',
                      justifyContent: 'space-around',
                    }}
                  >
                    <button onClick={() => setShowSlackConnectModal(false)}>
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        location.href = `https://slack.com/oauth/v2/authorize?client_id=${slackClientID}&scope=channels:history,channels:read,im:read,chat:write,im:write,users:read,users:read.email,channels:join&user_scope=&state=${userID}`;
                        setShowSlackConnectModal(false);
                      }}
                    >
                      Connect
                    </button>
                  </div>
                </>
              )}
              {showSlackShareModal && (
                <>
                  <div>
                    <label>
                      Choose Slack channel to share to:
                      <select
                        onChange={(event) =>
                          setSelectedSlackChannel(event.target.value)
                        }
                        style={{ marginLeft: '8px' }}
                      >
                        {slackChannels?.map((channel) => {
                          return (
                            <option value={channel.id}>#{channel.name}</option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                  <div
                    style={{
                      marginTop: '24px',
                      display: 'flex',
                      justifyContent: 'space-around',
                    }}
                  >
                    <button onClick={() => setShowSlackShareModal(false)}>
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        shareThreadToSlack(threadID);
                        setShowSlackShareModal(false);
                      }}
                    >
                      Share
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useCordToken(): [string | null, string | null] {
  const [token, setToken] = useState<string | null>(null);
  const [userID, setUserID] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://localhost:3001/userToken')
      .then((resp) => resp.json())
      .then((data) => {
        setToken(data.token);
        setUserID(data.userID);
      });
  }, []);
  return [token, userID];
}

function useGetSlackClientID() {
  const [slackClientID, setSlackClientID] = useState<string | null>(null);
  useEffect(() => {
    fetch('https://localhost:3001/slackClientID')
      .then((resp) => resp.text())
      .then((text) => setSlackClientID(text));
  }, []);
  return slackClientID;
}

function useSlackChannels() {
  const [slackChannels, setSlackChannels] = useState<
    { id: string; name: string }[] | null
  >(null);
  useEffect(() => {
    fetch('https://localhost:3001/slackChannels')
      .then((resp) => resp.json())
      .then((data) => setSlackChannels(data.channels));
  }, []);
  return slackChannels;
}

export default App;
