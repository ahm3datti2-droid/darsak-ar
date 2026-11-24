// درسك AR — مكتبة المنهج المصري الجاهزة
// دروس AR مقسّمة حسب الصف والمادة والترم. المعلّم يختار الدرس ويضيفه لدروسه
// أو يطبع الـ QR مباشرة. العناصر إمّا نماذج 3D جاهزة أو لوحات نصية
// (تتحوّل في المتصفح إلى .glb عبر textPanelToGlb).
//
// ملاحظة عن مواقع النقاط (pos) في أسئلة النماذج: إحداثيات تقريبية على سطح
// النموذج (بالمتر) — تظهر كأزرار تسمية على المجسّم، وتوجد دائمًا أزرار
// اختيارات أسفل العارض كبديل مضمون حتى لو كان موضع النقطة غير دقيق.

const MODELS = 'https://modelviewer.dev/shared-assets/models/';

export const LIBRARY = {
  grades: [
    'الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي',
    'الصف السادس الابتدائي',
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
  ],
  subjects: ['علوم', 'رياضيات', 'دراسات اجتماعية', 'لغة عربية', 'لغة إنجليزية'],
  terms: ['الترم الأول', 'الترم الثاني'],
  lessons: [
    {
      id: 'lib_sci4_solar', grade: 'الصف الرابع الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'المجموعة الشمسية', description: 'الشمس والكواكب الثمانية وروّاد الفضاء.',
      items: [
        { id: 'lib_sci4_solar_1', kind: 'model', title: 'رائد الفضاء', text_ar: 'رائد الفضاء يسافر خارج الأرض في مركبة فضائية، ويرتدي بدلة خاصة تحميه وتزوّده بالهواء والأكسجين.', text_en: 'An astronaut travels into space wearing a special suit that protects them and supplies air.', file_url: MODELS + 'Astronaut.glb', glb_url: MODELS + 'Astronaut.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '', quiz: { q: 'ما الذي يحمي رائد الفضاء في الفضاء؟', choices: [
          { t: 'البدلة الفضائية الخاصة', ok: true, pos: [0, 1.5, 0.15] },
          { t: 'المظلة', ok: false, pos: [0, 1.2, -0.25] },
          { t: 'الحذاء الرياضي', ok: false, pos: [0.15, 0.1, 0.1] } ] } },
        { id: 'lib_sci4_solar_2', kind: 'image', title: 'لوحة الكواكب', text_ar: 'الشمس في الوسط، وتدور حولها ثمانية كواكب: عطارد والزهرة والأرض والمريخ والمشتري وزحل وأورانوس ونبتون.', text_en: 'The Sun in the middle with eight planets orbiting around it.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'كواكب المجموعة الشمسية ☀️', quiz: { q: 'أي كوكب أقرب إلى الشمس؟', choices: [
          { t: 'عطارد', ok: true }, { t: 'المريخ', ok: false }, { t: 'زحل', ok: false } ] } },
        { id: 'lib_sci4_solar_3', kind: 'model', title: 'الروبوت المساعد', text_ar: 'الروبوتات تساعد روّاد الفضاء والعلماء في استكشاف الكواكب وجمع العينات من أماكن خطرة على الإنسان.', text_en: 'Robots help astronauts explore planets and collect samples from places too dangerous for humans.', file_url: MODELS + 'RobotExpressive.glb', glb_url: MODELS + 'RobotExpressive.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '', quiz: { q: 'ما فائدة الروبوت في استكشاف الفضاء؟', choices: [
          { t: 'يجمع العينات من الأماكن الخطرة', ok: true, pos: [0, 0.35, 0.15] },
          { t: 'يطهو الطعام لرواد الفضاء', ok: false, pos: [0.25, 0.4, 0.1] },
          { t: 'يقود المركبة وحدها دائمًا', ok: false, pos: [0, 0.62, 0.1] } ] } },
      ],
    },
    {
      id: 'lib_sci4_plant', grade: 'الصف الرابع الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'أجزاء النبات ووظائفها', description: 'الجذر والساق والأوراق والزهرة — كل جزء له وظيفة.',
      items: [
        { id: 'lib_sci4_plant_1', kind: 'image', title: 'الجذر', text_ar: 'الجذر يثبّت النبات في التربة ويمتص الماء والأملاح المعدنية من الأرض.', text_en: 'The root fixes the plant in the soil and absorbs water and minerals.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الجذر 🌱', quiz: { q: 'ما وظيفة الجذر؟', choices: [
          { t: 'يمتص الماء والأملاح من التربة', ok: true }, { t: 'يصنع الغذاء', ok: false }, { t: 'يحمل الأزهار', ok: false } ] } },
        { id: 'lib_sci4_plant_2', kind: 'image', title: 'الساق', text_ar: 'الساق تحمل الأوراق والأزهار، وتنقل الماء والغذاء بين الجذر وباقي أجزاء النبات.', text_en: 'The stem carries leaves and flowers and transports water and food.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الساق 🌿', quiz: { q: 'ما الذي تنقله الساق؟', choices: [
          { t: 'الماء والغذاء', ok: true }, { t: 'الضوء فقط', ok: false }, { t: 'الهواء فقط', ok: false } ] } },
        { id: 'lib_sci4_plant_3', kind: 'image', title: 'الأوراق', text_ar: 'الأوراق تصنع غذاء النبات بعملية البناء الضوئي باستخدام ضوء الشمس والماء وثاني أكسيد الكربون.', text_en: 'Leaves make the plant food by photosynthesis using sunlight, water and carbon dioxide.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الأوراق 🍃', quiz: { q: 'أين تتم عملية البناء الضوئي؟', choices: [
          { t: 'في الأوراق', ok: true }, { t: 'في الجذر', ok: false }, { t: 'في الزهرة', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci4_body', grade: 'الصف الرابع الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'أجهزة جسم الإنسان', description: 'القلب والرئتان والمعدة — أجهزة تعمل معًا.',
      items: [
        { id: 'lib_sci4_body_1', kind: 'image', title: 'القلب', text_ar: 'القلب عضلة تضخ الدم إلى جميع أجزاء الجسم، فينقل الأكسجين والغذاء لكل خلية.', text_en: 'The heart is a muscle that pumps blood to the whole body.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'القلب ❤️', quiz: { q: 'ما وظيفة القلب؟', choices: [
          { t: 'يضخ الدم لكل الجسم', ok: true }, { t: 'يهضم الطعام', ok: false }, { t: 'ينقّي الهواء', ok: false } ] } },
        { id: 'lib_sci4_body_2', kind: 'image', title: 'الرئتان', text_ar: 'الرئتان تأخذان الأكسجين من الهواء عند الشهيق، وتخرجان ثاني أكسيد الكربون عند الزفير.', text_en: 'The lungs take in oxygen and release carbon dioxide.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الرئتان 🫁', quiz: { q: 'ماذا نخرج مع الزفير؟', choices: [
          { t: 'ثاني أكسيد الكربون', ok: true }, { t: 'الأكسجين', ok: false }, { t: 'الماء', ok: false } ] } },
        { id: 'lib_sci4_body_3', kind: 'image', title: 'المعدة', text_ar: 'المعدة تهضم الطعام بمساعدة العصارات الهاضمة، ليستفيد الجسم من الغذاء.', text_en: 'The stomach digests food with digestive juices.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المعدة', quiz: { q: 'أين يبدأ هضم الطعام فعليًا؟', choices: [
          { t: 'في المعدة', ok: true }, { t: 'في القلب', ok: false }, { t: 'في الرئة', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci4_animals', grade: 'الصف الرابع الابتدائي', subject: 'علوم', term: 'الترم الثاني',
      title: 'تصنيف الحيوانات', description: 'حيوانات أليفة وبرية، وطيور وأسماك وثدييات.',
      items: [
        { id: 'lib_sci4_animals_1', kind: 'model', title: 'الحصان', text_ar: 'الحصان من الثدييات: يلد ويرضع صغاره، وكان من أهم وسائل النقل قبل السيارات.', text_en: 'The horse is a mammal: it gives birth and nurses its young.', file_url: MODELS + 'Horse.glb', glb_url: MODELS + 'Horse.glb', placement: 'floor', size: 'large', audio_url: '', video_url: '', quiz: { q: 'لماذا يُصنَّف الحصان من الثدييات؟', choices: [
          { t: 'لأنه يلد ويرضع صغاره', ok: true, pos: [0, 1.0, 0] },
          { t: 'لأنه يبيض', ok: false, pos: [0.55, 1.15, 0] },
          { t: 'لأنه يعيش في الماء', ok: false, pos: [-0.6, 1.0, 0] } ] } },
        { id: 'lib_sci4_animals_2', kind: 'image', title: 'الطيور', text_ar: 'الطيور لها ريش وأجنحة، وتضع البيض. معظمها يطير، وبعضها لا يطير مثل النعامة والبطريق.', text_en: 'Birds have feathers and wings and lay eggs.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الطيور 🐦', quiz: { q: 'ما الذي يميّز الطيور؟', choices: [
          { t: 'الريش والأجنحة', ok: true }, { t: 'الزعانف', ok: false }, { t: 'الفراء', ok: false } ] } },
        { id: 'lib_sci4_animals_3', kind: 'image', title: 'الأسماك', text_ar: 'الأسماك تعيش في الماء وتتنفس بالخياشيم، وتسبح بالزعانف.', text_en: 'Fish live in water, breathe with gills and swim with fins.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الأسماك 🐟', quiz: { q: 'بماذا تتنفس الأسماك؟', choices: [
          { t: 'بالخياشيم', ok: true }, { t: 'بالرئتين', ok: false }, { t: 'بالجلد', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci5_water', grade: 'الصف الخامس الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'دورة الماء في الطبيعة', description: 'تبخّر وتكاثف وهطول — رحلة قطرة الماء.',
      items: [
        { id: 'lib_sci5_water_1', kind: 'image', title: 'التبخّر', text_ar: 'تسخّن الشمس ماء البحار والأنهار فيتبخّر ويصعد بخار الماء إلى السماء.', text_en: 'The Sun heats seas and rivers; water evaporates and rises as vapor.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'التبخّر 💧', quiz: { q: 'ماذا يحدث للماء عند تسخينه؟', choices: [
          { t: 'يتبخّر ويصعد للسماء', ok: true }, { t: 'يتجمّد', ok: false }, { t: 'يختفي نهائيًا', ok: false } ] } },
        { id: 'lib_sci5_water_2', kind: 'image', title: 'التكاثف', text_ar: 'عندما يبرد بخار الماء في الأعلى يتكاثف ويكوّن قطرات صغيرة تتجمع في السحب.', text_en: 'Cooling vapor condenses into tiny droplets that form clouds.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'التكاثف ☁️', quiz: { q: 'كيف تتكون السحب؟', choices: [
          { t: 'بتكاثف بخار الماء البارد', ok: true }, { t: 'بسقوط المطر', ok: false }, { t: 'بذوبان الثلج', ok: false } ] } },
        { id: 'lib_sci5_water_3', kind: 'image', title: 'الهطول', text_ar: 'عندما تثقل قطرات الماء في السحب تسقط على الأرض مطرًا أو ثلجًا، ثم تعود الدورة من جديد.', text_en: 'Heavy droplets fall as rain or snow, and the cycle repeats.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الهطول 🌧️', quiz: { q: 'ما آخر مرحلة في دورة الماء؟', choices: [
          { t: 'الهطول', ok: true }, { t: 'التبخّر', ok: false }, { t: 'التكاثف', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci5_earth', grade: 'الصف الخامس الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'طبقات الأرض', description: 'القشرة والوشاح واللب — ما تحت أقدامنا.',
      items: [
        { id: 'lib_sci5_earth_1', kind: 'image', title: 'القشرة الأرضية', text_ar: 'القشرة هي الطبقة الخارجية الرقيقة التي نعيش عليها، وتتكون من صخور.', text_en: 'The crust is the thin outer layer we live on, made of rocks.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'القشرة الأرضية', quiz: { q: 'على أي طبقة نعيش؟', choices: [
          { t: 'القشرة الأرضية', ok: true }, { t: 'اللب', ok: false }, { t: 'الوشاح', ok: false } ] } },
        { id: 'lib_sci5_earth_2', kind: 'image', title: 'الوشاح', text_ar: 'الوشاح طبقة سميكة تحت القشرة، صخورها شديدة الحرارة وبعضها منصهر.', text_en: 'The mantle is a thick hot layer under the crust.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الوشاح', quiz: { q: 'أين يقع الوشاح؟', choices: [
          { t: 'بين القشرة واللب', ok: true }, { t: 'فوق القشرة', ok: false }, { t: 'في مركز الأرض فقط', ok: false } ] } },
        { id: 'lib_sci5_earth_3', kind: 'image', title: 'اللب', text_ar: 'اللب هو مركز الأرض، شديد الحرارة، ويتكون معظمه من الحديد والنيكل.', text_en: 'The core is Earth’s hot center, mostly iron and nickel.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'اللب', quiz: { q: 'ممّ يتكون لب الأرض معظمه؟', choices: [
          { t: 'الحديد والنيكل', ok: true }, { t: 'الماء', ok: false }, { t: 'الرمل', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci5_light', grade: 'الصف الخامس الابتدائي', subject: 'علوم', term: 'الترم الثاني',
      title: 'الضوء والظل', description: 'كيف يسير الضوء؟ ولماذا يتكون الظل؟',
      items: [
        { id: 'lib_sci5_light_1', kind: 'image', title: 'سير الضوء', text_ar: 'يسير الضوء في خطوط مستقيمة، ولذلك نرى الأجسام عندما يسقط عليها الضوء وينعكس إلى أعيننا.', text_en: 'Light travels in straight lines.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الضوء يسير في خطوط مستقيمة 💡', quiz: { q: 'كيف يسير الضوء؟', choices: [
          { t: 'في خطوط مستقيمة', ok: true }, { t: 'في دوائر', ok: false }, { t: 'في خطوط متعرجة', ok: false } ] } },
        { id: 'lib_sci5_light_2', kind: 'image', title: 'تكوّن الظل', text_ar: 'يتكون الظل عندما يعترض جسم معتم طريق الضوء، فيحجب جزءًا منه عن السطح خلفه.', text_en: 'A shadow forms when an opaque object blocks light.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الظل', quiz: { q: 'متى يتكون الظل؟', choices: [
          { t: 'عندما يحجب جسم معتم الضوء', ok: true }, { t: 'عندما ينعكس الضوء', ok: false }, { t: 'عندما يختفي الضوء', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci6_cell', grade: 'الصف السادس الابتدائي', subject: 'علوم', term: 'الترم الأول',
      title: 'الخلية — وحدة بناء الكائن الحي', description: 'النواة والسيتوبلازم والغشاء الخلوي.',
      items: [
        { id: 'lib_sci6_cell_1', kind: 'image', title: 'النواة', text_ar: 'النواة هي مركز التحكم في الخلية، وتحتوي على المادة الوراثية التي تحدد صفات الكائن الحي.', text_en: 'The nucleus controls the cell and holds the genetic material.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'النواة', quiz: { q: 'ما مركز التحكم في الخلية؟', choices: [
          { t: 'النواة', ok: true }, { t: 'الغشاء', ok: false }, { t: 'السيتوبلازم', ok: false } ] } },
        { id: 'lib_sci6_cell_2', kind: 'image', title: 'السيتوبلازم', text_ar: 'السيتوبلازم سائل هلامي يملأ الخلية، وتجري فيه معظم العمليات الحيوية.', text_en: 'Cytoplasm is the jelly-like fluid filling the cell.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'السيتوبلازم', quiz: { q: 'أين تجري معظم العمليات الحيوية في الخلية؟', choices: [
          { t: 'في السيتوبلازم', ok: true }, { t: 'خارج الخلية', ok: false }, { t: 'في النواة فقط', ok: false } ] } },
        { id: 'lib_sci6_cell_3', kind: 'image', title: 'الغشاء الخلوي', text_ar: 'الغشاء الخلوي يحيط بالخلية ويتحكم فيما يدخل إليها ويخرج منها.', text_en: 'The cell membrane surrounds the cell and controls what enters and leaves.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الغشاء الخلوي', quiz: { q: 'ما وظيفة الغشاء الخلوي؟', choices: [
          { t: 'يتحكم فيما يدخل ويخرج', ok: true }, { t: 'يصنع الغذاء', ok: false }, { t: 'يخزّن الماء', ok: false } ] } },
      ],
    },
    {
      id: 'lib_math4_shapes', grade: 'الصف الرابع الابتدائي', subject: 'رياضيات', term: 'الترم الأول',
      title: 'الأشكال الهندسية', description: 'المربع والمستطيل والمثلث والدائرة.',
      items: [
        { id: 'lib_math4_shapes_1', kind: 'image', title: 'المربع', text_ar: 'المربع له أربعة أضلاع متساوية وأربع زوايا قائمة. محيطه = طول الضلع × 4.', text_en: 'A square has four equal sides and four right angles.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المربع ⬜', quiz: { q: 'كم عدد أضلاع المربع؟', choices: [
          { t: '4 أضلاع متساوية', ok: true }, { t: '3 أضلاع', ok: false }, { t: '5 أضلاع', ok: false } ] } },
        { id: 'lib_math4_shapes_2', kind: 'image', title: 'المستطيل', text_ar: 'المستطيل له أربعة أضلاع: كل ضلعين متقابلين متساويان، وأربع زوايا قائمة.', text_en: 'A rectangle has opposite sides equal and four right angles.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المستطيل', quiz: { q: 'ما الذي يميّز المستطيل عن المربع؟', choices: [
          { t: 'ضلعاه المتقابلان متساويان فقط', ok: true }, { t: 'له 3 أضلاع', ok: false }, { t: 'ليس له زوايا قائمة', ok: false } ] } },
        { id: 'lib_math4_shapes_3', kind: 'image', title: 'المثلث', text_ar: 'المثلث له ثلاثة أضلاع وثلاث زوايا. مجموع زواياه 180 درجة.', text_en: 'A triangle has three sides and three angles summing to 180°.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المثلث 🔺', quiz: { q: 'ما مجموع زوايا المثلث؟', choices: [
          { t: '180 درجة', ok: true }, { t: '90 درجة', ok: false }, { t: '360 درجة', ok: false } ] } },
      ],
    },
    {
      id: 'lib_math4_frac', grade: 'الصف الرابع الابتدائي', subject: 'رياضيات', term: 'الترم الأول',
      title: 'الكسور', description: 'ما الكسر؟ وكيف نقارن بين الكسور؟',
      items: [
        { id: 'lib_math4_frac_1', kind: 'image', title: 'ما الكسر؟', text_ar: 'الكسر يعبّر عن جزء من الكل: مثلًا 1/2 تعني نصف الشيء، و1/4 تعني ربعه.', text_en: 'A fraction is a part of a whole: 1/2 is a half, 1/4 is a quarter.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الكسر 1/2', quiz: { q: 'ماذا يعني الكسر 1/2؟', choices: [
          { t: 'نصف الشيء', ok: true }, { t: 'ربع الشيء', ok: false }, { t: 'الشيء كاملًا', ok: false } ] } },
        { id: 'lib_math4_frac_2', kind: 'image', title: 'مقارنة الكسور', text_ar: 'عند تساوي المقامات، الكسر الأكبر هو صاحب البسط الأكبر: 3/4 أكبر من 1/4.', text_en: 'With equal denominators, the bigger numerator means the bigger fraction.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: '3/4 > 1/4', quiz: { q: 'أي كسر أكبر: 3/4 أم 1/4؟', choices: [
          { t: '3/4', ok: true }, { t: '1/4', ok: false }, { t: 'متساويان', ok: false } ] } },
      ],
    },
    {
      id: 'lib_math5_area', grade: 'الصف الخامس الابتدائي', subject: 'رياضيات', term: 'الترم الأول',
      title: 'المساحة والمحيط', description: 'مساحة المستطيل ومحيطه بالأمثلة.',
      items: [
        { id: 'lib_math5_area_1', kind: 'image', title: 'مساحة المستطيل', text_ar: 'مساحة المستطيل = الطول × العرض. مثال: مستطيل طوله 5م وعرضه 3م، مساحته = 15 مترًا مربعًا.', text_en: 'Area of a rectangle = length × width.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المساحة = الطول × العرض', quiz: { q: 'ما مساحة مستطيل طوله 5م وعرضه 3م؟', choices: [
          { t: '15 مترًا مربعًا', ok: true }, { t: '8 أمتار', ok: false }, { t: '16 مترًا', ok: false } ] } },
        { id: 'lib_math5_area_2', kind: 'image', title: 'محيط المستطيل', text_ar: 'محيط المستطيل = (الطول + العرض) × 2. مثال: مستطيل 5م × 3م، محيطه = 16 مترًا.', text_en: 'Perimeter of a rectangle = (length + width) × 2.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المحيط = (الطول + العرض) × 2', quiz: { q: 'ما محيط مستطيل 5م × 3م؟', choices: [
          { t: '16 مترًا', ok: true }, { t: '15 مترًا', ok: false }, { t: '8 أمتار', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci7_matter', grade: 'الصف الأول الإعدادي', subject: 'علوم', term: 'الترم الأول',
      title: 'المادة وحالاتها', description: 'صلبة وسائلة وغازية — وتحولاتها.',
      items: [
        { id: 'lib_sci7_matter_1', kind: 'image', title: 'الحالة الصلبة', text_ar: 'في الحالة الصلبة تكون جزيئات المادة مترابطة بقوة، ولها شكل وحجم ثابتان مثل الثلج والحديد.', text_en: 'In solids, particles are tightly bound with fixed shape and volume.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الحالة الصلبة 🧊', quiz: { q: 'ما صفة المادة الصلبة؟', choices: [
          { t: 'شكل وحجم ثابتان', ok: true }, { t: 'تأخذ شكل الإناء', ok: false }, { t: 'تنتشر في الهواء', ok: false } ] } },
        { id: 'lib_sci7_matter_2', kind: 'image', title: 'الحالة السائلة', text_ar: 'في الحالة السائلة تكون الجزيئات أقل ترابطًا: للماء حجم ثابت لكنه يأخذ شكل الإناء الذي يوضع فيه.', text_en: 'Liquids have fixed volume but take the shape of their container.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الحالة السائلة 💧', quiz: { q: 'ماذا يحدث للماء عند سكبه في إناء؟', choices: [
          { t: 'يأخذ شكل الإناء', ok: true }, { t: 'يحافظ على شكله', ok: false }, { t: 'يتبخّر فورًا', ok: false } ] } },
        { id: 'lib_sci7_matter_3', kind: 'image', title: 'الحالة الغازية', text_ar: 'في الحالة الغازية تتحرك الجزيئات بحرية وتنتشر لتملأ المكان كله، مثل بخار الماء والهواء.', text_en: 'In gases, particles move freely and fill the whole space.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الحالة الغازية 💨', quiz: { q: 'أي مما يلي غاز؟', choices: [
          { t: 'بخار الماء', ok: true }, { t: 'الثلج', ok: false }, { t: 'الحديد', ok: false } ] } },
      ],
    },
    {
      id: 'lib_sci7_energy', grade: 'الصف الأول الإعدادي', subject: 'علوم', term: 'الترم الأول',
      title: 'الطاقة وتحولاتها', description: 'صور الطاقة وتحوّلها من صورة إلى أخرى.',
      items: [
        { id: 'lib_sci7_energy_1', kind: 'image', title: 'الطاقة الحركية', text_ar: 'الطاقة الحركية هي طاقة الحركة: كل جسم متحرك يملك طاقة حركية تزيد بزيادة سرعته وكتلته.', text_en: 'Kinetic energy is the energy of motion.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'الطاقة الحركية 🏃', quiz: { q: 'متى تزيد الطاقة الحركية لجسم؟', choices: [
          { t: 'عندما تزيد سرعته', ok: true }, { t: 'عندما يتوقف', ok: false }, { t: 'عندما يبرد', ok: false } ] } },
        { id: 'lib_sci7_energy_2', kind: 'image', title: 'طاقة الوضع', text_ar: 'طاقة الوضع هي طاقة مخزّنة بسبب موضع الجسم أو ارتفاعه: كتاب على رف مرتفع يملك طاقة وضع أكبر.', text_en: 'Potential energy is stored energy due to position or height.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'طاقة الوضع 📚', quiz: { q: 'أين تكون طاقة الوضع أكبر؟', choices: [
          { t: 'لكتاب على رف مرتفع', ok: true }, { t: 'لكتاب على الأرض', ok: false }, { t: 'لكتاب يسقط', ok: false } ] } },
      ],
    },
    {
      id: 'lib_soc4_egypt', grade: 'الصف الرابع الابتدائي', subject: 'دراسات اجتماعية', term: 'الترم الأول',
      title: 'مصر — الموقع والحدود', description: 'أين تقع مصر؟ وما حدودها؟',
      items: [
        { id: 'lib_soc4_egypt_1', kind: 'image', title: 'موقع مصر', text_ar: 'تقع مصر في شمال شرق قارة إفريقيا، وتطل على البحر المتوسط شمالًا والبحر الأحمر شرقًا.', text_en: 'Egypt lies in northeast Africa, on the Mediterranean Sea and the Red Sea.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'موقع مصر 🗺️', quiz: { q: 'أين تقع مصر؟', choices: [
          { t: 'شمال شرق إفريقيا', ok: true }, { t: 'جنوب آسيا', ok: false }, { t: 'غرب أوروبا', ok: false } ] } },
        { id: 'lib_soc4_egypt_2', kind: 'image', title: 'حدود مصر', text_ar: 'يحد مصر من الشمال البحر المتوسط، ومن الشرق البحر الأحمر وفلسطين، ومن الغرب ليبيا، ومن الجنوب السودان.', text_en: 'Egypt is bordered by the Mediterranean, the Red Sea, Libya and Sudan.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'حدود مصر', quiz: { q: 'ما الدولة التي تحد مصر من الغرب؟', choices: [
          { t: 'ليبيا', ok: true }, { t: 'السودان', ok: false }, { t: 'فلسطين', ok: false } ] } },
      ],
    },
    {
      id: 'lib_ar4_grammar', grade: 'الصف الرابع الابتدائي', subject: 'لغة عربية', term: 'الترم الأول',
      title: 'الجملة الاسمية والفعلية', description: 'كيف نفرّق بين الجملة الاسمية والفعلية؟',
      items: [
        { id: 'lib_ar4_grammar_1', kind: 'image', title: 'الجملة الاسمية', text_ar: 'الجملة الاسمية تبدأ باسم، وتتكون من مبتدأ وخبر: مثال: «العلمُ نورٌ» — العلم مبتدأ، ونور خبر.', text_en: 'A nominal sentence starts with a noun: subject + predicate.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'العلمُ نورٌ', quiz: { q: 'ما نوع جملة «العلمُ نورٌ»؟', choices: [
          { t: 'جملة اسمية', ok: true }, { t: 'جملة فعلية', ok: false }, { t: 'شبه جملة', ok: false } ] } },
        { id: 'lib_ar4_grammar_2', kind: 'image', title: 'الجملة الفعلية', text_ar: 'الجملة الفعلية تبدأ بفعل، وتتكون من فعل وفاعل: مثال: «كتبَ التلميذُ الدرسَ» — كتب فعل، والتلميذ فاعل.', text_en: 'A verbal sentence starts with a verb: verb + subject.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'كتبَ التلميذُ الدرسَ', quiz: { q: 'ما نوع جملة «كتبَ التلميذُ الدرسَ»؟', choices: [
          { t: 'جملة فعلية', ok: true }, { t: 'جملة اسمية', ok: false }, { t: 'جملة شرطية', ok: false } ] } },
      ],
    },
    {
      id: 'lib_en4_animals', grade: 'الصف الرابع الابتدائي', subject: 'لغة إنجليزية', term: 'الترم الأول',
      title: 'Animals — الحيوانات', description: 'Horse, bird, fish — تعلّم أسماء الحيوانات بالإنجليزية.',
      items: [
        { id: 'lib_en4_animals_1', kind: 'model', title: 'Horse — حصان', text_ar: 'Horse يعني حصان. The horse is a mammal — الحصان من الثدييات.', text_en: 'Horse — a mammal that runs fast.', file_url: MODELS + 'Horse.glb', glb_url: MODELS + 'Horse.glb', placement: 'floor', size: 'large', audio_url: '', video_url: '', quiz: { q: 'What is the English word for حصان؟', choices: [
          { t: 'Horse', ok: true, pos: [0, 1.0, 0] },
          { t: 'Bird', ok: false, pos: [0.55, 1.15, 0] },
          { t: 'Fish', ok: false, pos: [-0.6, 1.0, 0] } ] } },
        { id: 'lib_en4_animals_2', kind: 'image', title: 'Bird — طائر', text_ar: 'Bird يعني طائر. The bird can fly — الطائر يستطيع الطيران.', text_en: 'Bird — it can fly.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'Bird 🐦', quiz: { q: 'What can a bird do؟', choices: [
          { t: 'Fly — يطير', ok: true }, { t: 'Swim under water', ok: false }, { t: 'Run fast', ok: false } ] } },
        { id: 'lib_en4_animals_3', kind: 'image', title: 'Fish — سمكة', text_ar: 'Fish يعني سمكة. The fish lives in water — السمكة تعيش في الماء.', text_en: 'Fish — it lives in water.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'Fish 🐟', quiz: { q: 'Where does a fish live؟', choices: [
          { t: 'In water — في الماء', ok: true }, { t: 'In the sky', ok: false }, { t: 'On trees', ok: false } ] } },
      ],
    },
  ],
};
