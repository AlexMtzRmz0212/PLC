// Everything personal on the site lives here.

export const profile = {
  name: 'Alex Martinez',
  role: 'Controls & Automation Engineer',
  // One or two sentences, first person, plain language.
  intro:
    'Mechatronics engineer trained in PLC and HMI programming, building the hands-on practice to back it up. Every program on this site runs live in your browser, in both Allen-Bradley and Siemens style.',
  location: 'Ottawa, ON',
  email: 'alejandro.martinez.rmz97@gmail.com',
  linkedin: 'https://www.linkedin.com/in/alejandro-mtz/',
  github: 'https://github.com/AlexMtzRmz0212',
  website: 'https://alex.bittobyte.qzz.io/',
  // Put a PDF at public/resume.pdf and set this to './resume.pdf' to show a download link.
  resume: '',

  // Shown as a list under "Tools I work with". Keep only what you can talk about in an interview.
  toolsNote: 'Learned in my Mechatronics Engineering degree, and practised in the programs on this site.',
  platforms: [
    { name: 'Rockwell Studio 5000 / ControlLogix, CompactLogix', level: '' },
    { name: 'Siemens TIA Portal / S7-1200, S7-1500', level: '' },
    { name: 'HMI: FactoryTalk View, WinCC', level: '' },
    { name: 'Languages: ladder (LD), Structured Text / SCL, FBD', level: '' },
    { name: 'Networks: EtherNet/IP, PROFINET, Modbus TCP', level: '' },
  ],

  // No client-confidential code; describe the machine, your role and the result.
  projects: [
    {
      title: 'PLC simulator (this site)',
      summary:
        'A scan-cycle PLC engine written from scratch, running four ladder programs against simulated machines: motor control, a pedestrian crossing, a sorting conveyor and a duplex lift station. Each program renders as Allen-Bradley or Siemens ladder, generates matching Structured Text / SCL, and supports fault injection. Covered by 43 automated tests.',
      tags: ['Ladder logic', 'ST / SCL', 'TypeScript', 'React'],
    },
  ],

  credentials: [
    'Bachelor of Mechatronics Engineering',
    'Bachelor of Arts in Management',
    'Graduate Certificate in Artificial Intelligence Software Development',
  ],
};
