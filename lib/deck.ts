export type Slide = {
  title: string;
  eyebrow: string;
  body: string;
  points: string[];
  narration: string;
};
export type Deck = { title: string; slides: Slide[] };
export const demo: Deck = {
  title: 'How does the internet work?',
  slides: [
    {
      eyebrow: 'THE BIG PICTURE',
      title: 'A world connected.\nOne packet at a time.',
      body: 'An everyday miracle, explained in five slides.',
      points: ['Your device', 'The network', 'A server'],
      narration:
        'Every time you open a website, your device starts a conversation with another computer. The internet makes that conversation possible. It is a global network of connected networks, moving small pieces of information called packets.',
    },
    {
      eyebrow: '01 / FIND THE ADDRESS',
      title: 'Names for us.\nNumbers for computers.',
      body: 'DNS translates a website name into an IP address.',
      points: ['Website name', 'DNS lookup', 'IP address'],
      narration:
        'You type a website name into your browser. Computers need a numerical address to find it. The Domain Name System, or DNS, looks up the IP address associated with that name. It works a little like looking up a contact before making a call.',
    },
    {
      eyebrow: '02 / BREAK IT DOWN',
      title: 'Big ideas travel\nin small packets.',
      body: 'Messages are split into pieces that the network can carry.',
      points: ['Your request', 'Small packets', 'The destination'],
      narration:
        'Your request is broken into packets. Each packet carries some data and addressing information. Routers forward them toward their destination. Packets can travel along different routes, so the network does not need a single dedicated connection for the whole conversation.',
    },
    {
      eyebrow: '03 / SEND IT BACK',
      title: 'A conversation\nat the speed of light.',
      body: 'The server responds. Your browser brings the pieces together.',
      points: ['Server responds', 'Packets return', 'Browser renders'],
      narration:
        'The server receives the request and sends back a response, often including the code, images, and text for a page. That response also travels in packets. Reliable transport protocols help recover missing data. Your browser assembles the content and renders the page you see.',
    },
    {
      eyebrow: 'THE TAKEAWAY',
      title: 'Many networks.\nOne shared language.',
      body: 'Shared protocols let billions of different devices communicate.',
      points: ['Find an address', 'Route the packets', 'Rebuild the message'],
      narration:
        'The internet works because independent networks agree on shared rules, called protocols. DNS helps find addresses. IP helps route packets. Transport protocols help deliver the data. Together, they let billions of devices exchange information, across the room or around the world.',
    },
  ],
};
export const estimatedDuration = (slide: Slide) =>
  Math.max(5, slide.narration.trim().split(/\s+/).length / 2.55);
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
