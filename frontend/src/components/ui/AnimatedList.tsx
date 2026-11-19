import { Children, isValidElement, type ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { cn } from '@/lib/cn';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  as?: 'div' | 'ul';
}

export function AnimatedList({ children, className, itemClassName, as = 'div' }: AnimatedListProps) {
  const items = Children.toArray(children);
  const Container = as === 'ul' ? motion.ul : motion.div;
  const Item = as === 'ul' ? motion.li : motion.div;

  return (
    <Container initial="hidden" animate="visible" variants={container} className={cn(className)}>
      {items.map((child, index) => (
        <Item
          key={isValidElement(child) && child.key !== null ? child.key : index}
          variants={item}
          className={itemClassName}
        >
          {child}
        </Item>
      ))}
    </Container>
  );
}
