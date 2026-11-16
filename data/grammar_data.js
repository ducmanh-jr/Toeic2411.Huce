// Grammar Topics Data
const grammarTopics = [
  {
    id: "tenses",
    title: "1. Thì Tiếng Anh (English Tenses)",
    summary: `
      <p><b>Dấu hiệu nhận biết thì hay gặp trong TOEIC:</b></p>
      <ul>
        <li><b>Present Simple:</b> always, usually, every week, Monday.</li>
        <li><b>Past Simple:</b> yesterday, last month, ago, in 2022.</li>
        <li><b>Present Perfect:</b> since, for, recently, already, yet.</li>
        <li><b>Future Simple:</b> next week, tomorrow, soon, shortly.</li>
      </ul>
    `,
    questions: [
      {
        text: "The supervisor _______ the financial statement every Monday morning.",
        options: ["(A) review", "(B) reviews", "(C) reviewing", "(D) reviewed"],
        answer: 1,
        explanation: "Dấu hiệu 'every Monday morning' là hiện tại đơn. Chủ ngữ 'The supervisor' là số ít nên chọn 'reviews'."
      },
      {
        text: "The delivery truck _______ at the warehouse an hour ago.",
        options: ["(A) arrive", "(B) arrives", "(C) arrived", "(D) arriving"],
        answer: 2,
        explanation: "Dấu hiệu 'an hour ago' chỉ quá khứ đơn, nên dùng dạng quá khứ 'arrived'."
      }
    ]
  },
  {
    id: "passive",
    title: "2. Câu Bị Động (Passive Voice)",
    summary: `
      <p><b>Công thức chung:</b> S + be + V3 / V-ed (+ by O)</p>
      <ul>
        <li><b>Hiện tại đơn:</b> is / am / are + V3</li>
        <li><b>Quá khứ đơn:</b> was / were + V3</li>
        <li><b>Hiện tại hoàn thành:</b> has / have been + V3</li>
        <li><b>Động từ khuyết thiếu:</b> can / must / will + be + V3</li>
      </ul>
    `,
    questions: [
      {
        text: "All confidential documents must be _______ in the secure safe before leaving.",
        options: ["(A) store", "(B) stored", "(C) storing", "(D) storage"],
        answer: 1,
        explanation: "Cấu trúc bị động với modal verb: 'must be + V3'. Chọn 'stored'."
      }
    ]
  },
  {
    id: "relative",
    title: "3. Mệnh Đề Quan Hệ (Relative Clauses)",
    summary: `
      <p><b>Các đại từ quan hệ thường gặp:</b></p>
      <ul>
        <li><b>Who:</b> Thay thế cho người (làm chủ ngữ).</li>
        <li><b>Whom:</b> Thay thế cho người (làm tân ngữ).</li>
        <li><b>Which:</b> Thay thế cho vật/sự việc.</li>
        <li><b>Whose:</b> Chỉ sở hữu (+ Noun).</li>
      </ul>
    `,
    questions: [
      {
        text: "We interviewed a candidate _______ previous work experience fits our needs perfectly.",
        options: ["(A) who", "(B) whom", "(C) whose", "(D) which"],
        answer: 2,
        explanation: "Phía sau có danh từ 'previous work experience' thuộc sở hữu của candidate -> Dùng 'whose'."
      }
    ]
  },
  {
    id: "pos",
    title: "4. Từ Loại (Parts of Speech & Word Form)",
    summary: `
      <p><b>Quy tắc vị trí từ loại Part 5:</b></p>
      <ul>
        <li><b>Adjective + Noun:</b> a <i>successful</i> candidate.</li>
        <li><b>Verb + Adverb:</b> analyze the data <i>thoroughly</i>.</li>
        <li><b>Preposition + Noun / V-ing:</b> in <i>preparation</i> for.</li>
      </ul>
    `,
    questions: [
      {
        text: "The new software system operates _______ and significantly reduces processing time.",
        options: ["(A) efficient", "(B) efficiency", "(C) efficiently", "(D) efficiencies"],
        answer: 2,
        explanation: "Động từ 'operates' cần được bổ nghĩa bởi trạng từ 'efficiently'."
      }
    ]
  },
  {
    id: "prep_conj",
    title: "5. Giới Từ & Liên Từ (Prepositions & Conjunctions)",
    summary: `
      <p><b>Phân biệt Liên từ và Giới từ:</b></p>
      <ul>
        <li><b>Because / Although (+ Clause):</b> Theo sau là Mệnh đề (S + V).</li>
        <li><b>Because of / Despite (+ Noun/V-ing):</b> Theo sau là Cụm danh từ.</li>
      </ul>
    `,
    questions: [
      {
        text: "_______ heavy traffic on the highway, Mr. Davis arrived on time for the presentation.",
        options: ["(A) Although", "(B) Despite", "(C) Because", "(D) Unless"],
        answer: 1,
        explanation: "Theo sau là cụm danh từ 'heavy traffic', mang nghĩa nhượng bộ (dù giao thông đông đúc) -> Dùng 'Despite'."
      }
    ]
  },
  {
    id: "inversion",
    title: "6. Đảo Ngữ & Thể Giả Định (Inversion)",
    summary: `
      <p><b>Các cấu trúc Đảo ngữ nâng cao:</b></p>
      <ul>
        <li><b>Should + S + V0:</b> Đảo ngữ câu điều kiện loại 1 (If -> Should).</li>
        <li><b>Were + S + to V:</b> Đảo ngữ câu điều kiện loại 2.</li>
        <li><b>Not only + Trợ động từ + S + V:</b> Không những... mà còn.</li>
      </ul>
    `,
    questions: [
      {
        text: "_______ you require any additional assistance, please contact the customer support team.",
        options: ["(A) Should", "(B) Were", "(C) Had", "(D) Unless"],
        answer: 0,
        explanation: "Đảo ngữ điều kiện loại 1 với 'Should' thay cho 'If'. (Should you require = If you require)."
      }
    ]
  }
];
