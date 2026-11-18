import { useId, useState } from 'react'
import './lesson-quiz.css'

interface ChapterQuiz {
  question: string
  correctIndex: number
  options: readonly { label: string; explanation: string }[]
}

const chapterQuizzes: Record<string, ChapterQuiz> = {
  'chapter:token': {
    question: '为什么要加入位置信息？',
    correctIndex: 0,
    options: [
      { label: '告诉模型词块的先后顺序', explanation: '内容向量表示词块是什么，位置信息补充它排在哪里。' },
      { label: '增加词表里的词', explanation: '位置信息不会增加词表里的词；它告诉模型，同一个词块出现在句子的哪个位置。' },
      { label: '直接选出下一个词块', explanation: '选出下一个词块发生在输出阶段。位置信息先帮助模型分清输入词块的顺序。' },
    ],
  },
  'chapter:attention': {
    question: '使用因果注意力时，当前位置可以读取哪些内容？',
    correctIndex: 1,
    options: [
      { label: '只能读取自己', explanation: '当前位置也能读取之前已经出现的词块，利用这些上下文理解当前内容。' },
      { label: '自己和之前的位置', explanation: '未来位置会被遮住，避免预测时提前看到答案；自己和之前的位置仍然可见。' },
      { label: '包括未来在内的全部位置', explanation: '未来位置会被因果掩码遮住，否则模型就会提前看到要预测的内容。' },
    ],
  },
  'chapter:feed-forward': {
    question: '残差连接怎样合并信息？',
    correctIndex: 2,
    options: [
      { label: '删除原输入，只保留新结果', explanation: '残差连接会保留原输入，再加上子层算出的修改，不会直接删掉原来的信息。' },
      { label: '把两个向量首尾拼接', explanation: '首尾拼接会增加维度。残差连接是对应位置逐项相加，形状保持不变。' },
      { label: '把原输入与子层输出逐项相加', explanation: '原信息沿旁路保留，再叠加子层计算出的修改；相加前两者形状需要一致。' },
    ],
  },
  'chapter:output': {
    question: '使用随机采样时，概率最高的候选一定会被选中吗？',
    correctIndex: 1,
    options: [
      { label: '一定会选中概率最高的候选', explanation: '随机采样并不总取第一名；只要筛选后还有其他概率大于零的候选，它们也可能被选中。' },
      { label: '不一定，其他保留候选也有机会', explanation: '采样按照筛选后的概率抽取。概率高代表机会大，不代表必然选中。' },
      { label: '概率完全不影响结果', explanation: '概率会影响被抽中的机会。概率越高，随机采样选中它的机会越大。' },
    ],
  },
}

export function LessonQuiz({ chapterId }: { chapterId: string }) {
  const id = useId()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const quiz = chapterQuizzes[chapterId]
  if (!quiz) return null
  const selectedOption = selectedIndex === null ? null : quiz.options[selectedIndex]
  const isCorrect = selectedIndex === quiz.correctIndex

  return (
    <section className="lesson-quiz" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>章末小练习</h2>
      <p className="lesson-quiz__hint" id={`${id}-hint`}>可以跳过，不影响继续学习；选择后可随时重选。</p>
      <fieldset aria-describedby={`${id}-hint`}>
        <legend>{quiz.question}</legend>
        <div className="lesson-quiz__options">
          {quiz.options.map((option, index) => (
            <label className="lesson-quiz__option" key={option.label} data-selected={selectedIndex === index}>
              <input
                type="radio"
                name={id}
                value={index}
                checked={selectedIndex === index}
                onChange={() => setSelectedIndex(index)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="lesson-quiz__feedback" role="status" aria-atomic="true">
        {selectedOption && (
          <><strong>{isCorrect ? '答对了。' : '再想一想。'}</strong>{selectedOption.explanation}</>
        )}
      </p>
    </section>
  )
}
