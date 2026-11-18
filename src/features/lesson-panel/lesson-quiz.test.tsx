import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LessonQuiz } from './lesson-quiz'

describe('可选章末练习', () => {
  it.each([
    ['chapter:token', '告诉模型词块的先后顺序', '增加词表里的词', '内容向量表示词块是什么'],
    ['chapter:attention', '自己和之前的位置', '只能读取自己', '未来位置会被遮住'],
    ['chapter:feed-forward', '把原输入与子层输出逐项相加', '把两个向量首尾拼接', '原信息沿旁路保留'],
    ['chapter:output', '不一定，其他保留候选也有机会', '概率完全不影响结果', '采样按照筛选后的概率抽取'],
  ])('%s 提供三个选项，可从错误答案重选并理解原因', async (chapterId, correct, incorrect, explanation) => {
    const user = userEvent.setup()
    render(<LessonQuiz chapterId={chapterId} />)
    const quiz = within(screen.getByRole('region', { name: '章末小练习' }))
    expect(quiz.getAllByRole('radio')).toHaveLength(3)
    expect(quiz.getByRole('status')).toBeEmptyDOMElement()

    await user.click(quiz.getByRole('radio', { name: incorrect }))
    expect(quiz.getByRole('status')).toHaveTextContent('再想一想。')
    const incorrectExplanation = quiz.getByRole('status').textContent

    await user.click(quiz.getByRole('radio', { name: correct }))
    expect(quiz.getByRole('radio', { name: correct })).toBeChecked()
    expect(quiz.getByRole('radio', { name: incorrect })).not.toBeChecked()
    expect(quiz.getByRole('status')).toHaveTextContent(`答对了。${explanation}`)
    expect(quiz.getByRole('status').textContent).not.toBe(incorrectExplanation)
  })

  it('可以用 Tab、空格和方向键完成选择', async () => {
    const user = userEvent.setup()
    render(<LessonQuiz chapterId="chapter:token" />)
    const firstOption = screen.getByRole('radio', { name: '告诉模型词块的先后顺序' })

    await user.tab()
    expect(firstOption).toHaveFocus()
    await user.keyboard(' ')
    expect(firstOption).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('答对了。')

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: '增加词表里的词' })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('再想一想。')
  })
})
